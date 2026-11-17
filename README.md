# Compact Desk

Sua coleção de CDs numa prateleira 3D com estética de console dos anos 2000: polígonos, pixels e filtro de TV de tubo.

Feito em **Rust (Tauri 2)** + **Three.js**.

## Rodar

```bash
npm install
npm run tauri dev
```

## O que tem

- Estante 3D personalizável (cenários, acabamentos, tamanho, CDs de frente ou de lombada) com filtro de TV retrô
- Jewel case realista: capa, contracapa, lombadas recortadas da foto, disco com arte ou cromado impresso, encarte por dentro
- Cadastro pelo código de barras via API do Discogs (escolhe a prensagem com mais fotos)
- Ficha do CD com lado A/B, duração, galeria e folheador de encartes, botão do Spotify
- TV de tubo com "tocando agora" e prévias de 30 s, quadrinhos com capas, lojinha de decorações
- Modo Organizar: arraste CDs (com espaços vazios) e móveis, com colisão

## Controles

- Arraste: mover a vista · roda: zoom
- Passe o mouse: o CD sobe · clique: pega o CD (arraste para girar)
- Espaço: abre o estojo · clique no encarte aberto: folhear · Esc: devolver
- Clique na TV: zoom e prévias
