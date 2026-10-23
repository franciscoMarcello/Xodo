# Xodó

<img src="build/icon.png" width="96" alt="Ícone do Xodó: coração com linha de batimento">

**O Xodó cuida do seu PC.** App de bandeja para Windows (Electron + React + TypeScript), leve (~140 MB de memória e menos de
0,1% de CPU com a janela fechada), que junta:

- **Visão geral e overlay**: CPU, GPU, RAM, temperaturas, rede e consumo, a cada 2 s. O overlay fica sempre por cima, em 3 tamanhos (pequeno, médio, grande), fixo num canto (o mouse passa direto) ou livre para arrastar; liga e desliga em Ajustes.
- **Meu PC**: ficha completa (processador, placa de vídeo com VRAM real, pentes de memória, discos e saúde, placa-mãe e BIOS, monitores, rede, Windows) com observações (memória abaixo da velocidade, dual channel, BIOS antiga, disco com problema) e exportação em PDF. Lida do Windows sem administrador, só quando a aba abre (~4 s).
- **Travamentos**: desligamentos inesperados, telas azuis, erros de hardware, driver de vídeo reiniciando e programas que fecharam (registro de eventos do Windows), cruzados com a temperatura e o jogo de cada momento, com causas prováveis e o que fazer (`crashes/`).
- **Saúde dos discos** (em Disco e limpeza): vida, total gravado, horas ligado e temperatura de cada SSD/HD pelos dados S.M.A.R.T. que já chegam dos sensores, com alertas (`diskhealth.ts`).
- **Modo Jogo automático** (em Jogos): fecha os programas escolhidos quando um jogo abre e reabre com os mesmos argumentos quando ele fecha (`gamemode.ts`).
- **Lag: internet ou PC?** (em Jogos > Agora): ping ao roteador e à internet durante jogos, junto com o gargalo, diz se o lag é do Wi-Fi, da operadora, do PC ou do servidor (`netlag/`).
- **Relatório**: tudo num documento só, exportável em PDF.
- **Otimizar**: checa disco sem letra, espaço no C:, programas da inicialização (marca sobras), plano de energia, Modo de Jogo, gravação em segundo plano do Xbox, agendamento de GPU, Resizable BAR/SAM, arquivo de paginação, cache de shaders e a temperatura da CPU parada (pelo histórico). Muda com um clique só configurações do usuário (inicialização, energia, Modo de Jogo, gravação, cache), sempre com "Desfazer"; o resto é passo a passo (`optimize/`).
- **Drivers**: drivers instalados, o que o Windows Update oferece (só avisa se for mais novo que o instalado) e a versão mais nova do AMD Software: Adrenalin no site da AMD para a placa Radeon. Verifica 1 vez por dia, fora de jogos (~12 s), e avisa em Alertas. Não instala nada sozinho.
- **Alertas**: 12 regras de "coisa fora do normal" (RAM cheia, programa pesado, vazamento de memória, CPU em segundo plano, CPU quente parada, superaquecimento, disco cheio ou enchendo rápido, internet lenta, PC sem reiniciar, programa em pasta incomum, novo na inicialização). Usam só dados que o painel já coleta. Contador no menu e no widget; ignorar ou silenciar por 7 dias.
- **Histórico**: média e máximo de uso (CPU, GPU, RAM), temperatura (CPU, GPU) e consumo, em 24 h, 7 dias e 30 dias. Resumo por minuto em `history/AAAA-MM-DD.jsonl` (7 dias, ~260 KB/dia) e por hora em `history/hours.jsonl` (para sempre, ~4 KB/dia).
- **Processos**: lista agrupada por programa, com CPU, memória, busca e finalizar (programas essenciais protegidos). Lê a cada 5 s só com a aba aberta.
- **Disco e limpeza**: espaço dos discos, tamanho das pastas principais, 30 maiores arquivos de uma pasta (com envio para a Lixeira), programas instalados e limpeza de temporários com mais de 1 dia.
- **Organizador**: vigia a pasta Downloads e move cada arquivo novo para a pasta da regra da extensão. Tem histórico e "Desfazer". Vem desligado.
- **Jogos**: detecta jogos das pastas da Steam, Epic, Xbox, Riot, GOG, Ubisoft, EA e Amazon e grava sessões com tempo, temperaturas, FPS e gargalo.
  - **Agora**: gargalo do jogo aberto (GPU no limite, processador, memória de vídeo, RAM, temperatura ou FPS travado), pelos últimos 20 s de GPU, núcleo mais carregado, VRAM e FPS (`bottleneck.ts`).
  - **Posso rodar?**: requisitos da Steam (API pública, cache de 30 dias) comparados com o PC por uma tabela de desempenho relativo de CPUs e GPUs (`gamesdb/`). Resultado: Baixo/Médio/Alto/Ultra em 1080p, como estimativa.
- **Internet**: teste de velocidade automático (speed.cloudflare.com, uns 50 MB por teste) a cada N horas, fora de jogos.
- **Energia**: soma a potência de CPU, GPU e do resto do PC e converte em R$ pela tarifa.

## Rodar

```bash
npm install
npm run dev      # desenvolvimento, com recarga
npm run build    # gera out/
npm start        # roda o que está em out/
npm test         # testes das regras de alerta
npm run dist     # gera o instalador em release/
```

## Leveza

Sem aceleração de GPU, a janela é destruída ao fechar e os processos são lidos a cada 1 min (5 s só com a aba
Processos aberta). Medido só com o widget: ~140 MB de memória própria e menos de 0,1% de CPU.

Fechar a janela só esconde o painel na bandeja. Para sair: botão direito no ícone da bandeja > Sair.

## Sensores

Temperaturas, uso da GPU e potência vêm do servidor web do [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
(`http://127.0.0.1:8085/data.json`). Ele precisa rodar como administrador. Sem ele, o painel funciona com CPU, RAM e rede,
e estima o consumo pelo uso.

## Dados

Ficam em `%APPDATA%\Xodó` (quem vem do antigo "Painel do PC" tem os dados copiados de `%APPDATA%\Painel do PC` na primeira vez; ver `src/main/migrate.ts`): `settings.json`, `energy.json` e os históricos `games.jsonl`, `speed.jsonl` e `organizer-log.jsonl`.

## Estrutura

- `src/main`: processo principal (Node). Um arquivo por função: `sensors`, `processes`, `disk`, `organizer`, `games`, `speedtest`, `energy`, `store`.
- `src/main/alerts`: `detectors.ts` (regras puras, com testes) e `engine.ts` (liga as regras nas leituras e guarda os alertas).
- `src/preload`: ponte IPC (`window.api`).
- `src/renderer`: interface React. `pages/` tem uma tela por função; `Widget.tsx` é o overlay.
- `src/shared/types.ts`: tipos usados nos dois lados.

## Licença

MIT (veja `LICENSE`). O LibreHardwareMonitor não vem junto: é um programa separado (licença MPL-2.0) que o Xodó só lê
pelo servidor web local.
