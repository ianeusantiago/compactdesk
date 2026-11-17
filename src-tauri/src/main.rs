#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const UA: &str = "CompactDesk/0.1 +https://github.com/ianeusantiago/compactdesk";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().user_agent(UA).build().map_err(|e| e.to_string())
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("covers")).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Texto de um campo JSON que pode vir como string ou número.
fn text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Array(a) => a.iter().map(text).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(", "),
        _ => String::new(),
    }
}

/// Discogs marca homônimos como "Nome (2)"; tiramos o sufixo.
fn clean_name(s: &str) -> String {
    match s.rfind(" (") {
        Some(i) if s.ends_with(')') && s[i + 2..s.len() - 1].chars().all(|c| c.is_ascii_digit()) => s[..i].to_string(),
        _ => s.to_string(),
    }
}

async fn discogs(url: &str, token: &str) -> Result<Value, String> {
    if token.trim().is_empty() {
        return Err("Configure seu token do Discogs em Personalizar.".into());
    }
    let r = client()?
        .get(url)
        .header("Authorization", format!("Discogs token={}", token.trim()))
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Discogs: {e}"))?;
    match r.status().as_u16() {
        200 => r.json().await.map_err(|e| e.to_string()),
        401 => Err("Token do Discogs inválido.".into()),
        429 => Err("Muitas buscas seguidas. Espere um minuto.".into()),
        s => Err(format!("O Discogs respondeu {s}.")),
    }
}

#[derive(Serialize)]
struct Candidate {
    id: u64,
    title: String,
    year: String,
    country: String,
    label: String,
    catno: String,
    format: String,
    thumb: String,
    images: usize,
}

/// Conta quantas fotos cada versão tem no Discogs (em paralelo, até 15 versões).
async fn count_images(list: &mut [Candidate], token: &str) {
    let tasks: Vec<_> = list
        .iter()
        .take(15)
        .map(|c| {
            let (url, token) = (format!("https://api.discogs.com/releases/{}", c.id), token.to_string());
            tauri::async_runtime::spawn(async move {
                discogs(&url, &token).await.ok().and_then(|v| v["images"].as_array().map(|a| a.len())).unwrap_or(0)
            })
        })
        .collect();
    for (c, t) in list.iter_mut().zip(tasks) {
        c.images = t.await.unwrap_or(0);
    }
}

#[tauri::command]
async fn search_barcode(barcode: String, token: String) -> Result<Vec<Candidate>, String> {
    let code: String = barcode.chars().filter(|c| c.is_ascii_digit()).collect();
    if code.len() < 8 {
        return Err("Código de barras incompleto.".into());
    }
    let url = format!("https://api.discogs.com/database/search?barcode={code}&type=release&per_page=30");
    let v = discogs(&url, &token).await?;
    let list = v["results"].as_array().cloned().unwrap_or_default();
    let mut out: Vec<Candidate> = list
        .iter()
        .map(|r| Candidate {
            id: r["id"].as_u64().unwrap_or(0),
            title: text(&r["title"]),
            year: text(&r["year"]),
            country: text(&r["country"]),
            label: r["label"].as_array().and_then(|a| a.first()).map(text).unwrap_or_default(),
            catno: text(&r["catno"]),
            format: text(&r["format"]),
            thumb: text(&r["thumb"]),
            images: 0,
        })
        .collect();
    // a versão com mais fotos (capa, contracapa, disco, encartes) vem primeiro
    count_images(&mut out, &token).await;
    out.sort_by(|a, b| b.images.cmp(&a.images));
    Ok(out)
}

async fn save_image(app: &AppHandle, url: &str, name: &str) -> Option<String> {
    let bytes = client().ok()?.get(url).send().await.ok()?.bytes().await.ok()?;
    fs::write(data_dir(app).ok()?.join("covers").join(name), &bytes).ok()?;
    Some(name.to_string())
}

/// Busca o lançamento completo, baixa capa e contracapa e devolve o álbum pronto para a coleção.
#[tauri::command]
async fn fetch_release(app: AppHandle, id: u64, token: String, barcode: String) -> Result<Value, String> {
    let r = discogs(&format!("https://api.discogs.com/releases/{id}"), &token).await?;

    let artist = r["artists"]
        .as_array()
        .map(|a| a.iter().map(|x| clean_name(&text(&x["name"]))).collect::<Vec<_>>().join(", "))
        .unwrap_or_default();
    let tracks: Vec<Value> = r["tracklist"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter(|t| text(&t["type_"]) != "heading")
        .map(|t| json!({ "position": text(&t["position"]), "title": text(&t["title"]), "duration": text(&t["duration"]) }))
        .collect();

    // Baixa todas as fotos (capa, contracapa, disco, encartes...) — até 30.
    let mut saved: Vec<Value> = Vec::new();
    for (i, img) in r["images"].as_array().cloned().unwrap_or_default().iter().take(30).enumerate() {
        if let Some(name) = save_image(&app, &text(&img["uri"]), &format!("{id}-{i}.jpg")).await {
            saved.push(json!({
                "name": name,
                "type": text(&img["type"]),
                "w": img["width"].as_u64().unwrap_or(0),
                "h": img["height"].as_u64().unwrap_or(0),
            }));
        }
    }
    let ratio = |v: &Value| v["w"].as_f64().unwrap_or(1.0) / v["h"].as_f64().unwrap_or(1.0).max(1.0);
    let front = saved.iter().find(|v| v["type"] == "primary").or(saved.first()).map(|v| text(&v["name"]));
    // contracapa: imagem "deitada" (encarte traseiro mede 151 × 118 mm)
    let back = saved
        .iter()
        .filter(|v| Some(text(&v["name"])) != front)
        .find(|v| (1.08..1.45).contains(&ratio(v)))
        .map(|v| text(&v["name"]));

    let label = r["labels"].as_array().and_then(|a| a.first());
    Ok(json!({
        "id": id,
        "title": text(&r["title"]),
        "artist": artist,
        "year": text(&r["year"]),
        "country": text(&r["country"]),
        "label": label.map(|l| clean_name(&text(&l["name"]))).unwrap_or_default(),
        "catno": label.map(|l| text(&l["catno"])).unwrap_or_default(),
        "barcode": barcode,
        "genres": text(&r["genres"]),
        "tracks": tracks,
        "front": front,
        "back": back,
        "images": saved,
        "uri": text(&r["uri"]),
        "added": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0),
    }))
}

/// Prévia de 30 s pela busca pública do iTunes/Apple Music (não precisa de conta).
/// Procura na loja do Brasil e depois na dos EUA; prefere o resultado do mesmo artista.
#[tauri::command]
async fn find_preview(artist: String, title: String, album: String) -> Result<Option<String>, String> {
    let norm = |s: &str| s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>();
    let want = norm(&artist);
    for country in ["BR", "US"] {
        let r = client()?
            .get("https://itunes.apple.com/search")
            .query(&[("term", format!("{artist} {title}").as_str()), ("entity", "song"), ("limit", "10"), ("country", country)])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let v: Value = r.json().await.map_err(|e| e.to_string())?;
        let list = v["results"].as_array().cloned().unwrap_or_default();
        let score = |x: &Value| {
            let a = norm(&text(&x["artistName"]));
            (a.contains(&want) || want.contains(&a)) as u8 * 2 + (norm(&text(&x["collectionName"])) == norm(&album)) as u8
        };
        if let Some(best) = list.iter().filter(|x| x["previewUrl"].is_string()).max_by_key(|x| score(x)) {
            if score(best) >= 2 {
                return Ok(Some(text(&best["previewUrl"])));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Value, String> {
    match fs::read_to_string(data_dir(&app)?.join("settings.json")) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(Value::Null),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    let s = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(data_dir(&app)?.join("settings.json"), s).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_collection(app: AppHandle) -> Result<Value, String> {
    match fs::read_to_string(data_dir(&app)?.join("collection.json")) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(json!([])),
    }
}

#[tauri::command]
fn save_collection(app: AppHandle, items: Value) -> Result<(), String> {
    let s = serde_json::to_string_pretty(&items).map_err(|e| e.to_string())?;
    fs::write(data_dir(&app)?.join("collection.json"), s).map_err(|e| e.to_string())
}

/// Lê uma imagem salva e devolve como data URL (o WebGL aceita sem problema de CORS).
#[tauri::command]
fn read_image(app: AppHandle, name: String) -> Result<String, String> {
    if name.contains(['/', '\\']) || name.contains("..") {
        return Err("nome inválido".into());
    }
    let bytes = fs::read(data_dir(&app)?.join("covers").join(&name)).map_err(|e| e.to_string())?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("só links https".into());
    }
    open::that(url).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            search_barcode,
            fetch_release,
            find_preview,
            load_settings,
            save_settings,
            load_collection,
            save_collection,
            read_image,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Compact Desk");
}
