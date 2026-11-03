# Observações da análise

Mateus Kalil - RM565098. Leonardo Lago Garroti - RM565963.

O escopo desta entrega é somente o Operação Blackout recebido em `exgame/public_html/blackout`. Os resultados a seguir vêm das ferramentas executadas e dos arquivos incluídos em `docs/evidencias`. Um resultado local não comprova publicação, aprovação ou deploy na nuvem.

## Origem e dependências do jogo

Recebemos o build do navegador, com JavaScript e CSS prontos. Não havia o projeto React original, seu lockfile ou testes de origem. O jogo foi preservado byte a byte; `config/origem-jogo.json` registra os hashes. A nova página de entrada carrega o jogo diretamente, sem depender do login, ranking e recursos de voz do portal PHP.

O servidor HTTP usa os módulos nativos do Node. O Prettier 3.9.10 é uma ferramenta de desenvolvimento, fixada no lock, para preparar a entrada do SAST. O npm audit cobre esse ambiente de desenvolvimento. Para o bundle, identificamos quatro versões explícitas: React 19.2.6, React DOM 19.2.6, Three.js 0.184.0 e React Three Fiber 9.6.1. Elas entram no inventário parcial CycloneDX e em um scan adicional do Trivy.

Essa identificação não revela todas as dependências transitivas ou a árvore original de build. Classificação: limitação de cobertura. Ação recomendada: obter o projeto-fonte e o lockfile original antes de considerar o SCA do cliente completo. O inventário parcial não é apresentado como lockfile recuperado.

## Gitleaks

A varredura inicial da main não encontrou segredos. Depois da demonstração, o checkout com histórico completo também trouxe a branch com a credencial fictícia; o Gitleaks voltou a encontrá-la em execuções da main. Os relatórios usam --redact para não reexpor o valor.

O experimento de referência está na branch teste/quality-gate e em `github/gate-limpo`. O identificador detectado foi `github-pat`, na primeira linha de um arquivo com credencial fictícia criado em um repositório temporário. O scanner retornou 1. Depois de remover o arquivo apenas do último commit, o scanner continuou retornando 1. Em um histórico limpo, retornou 0.

Classificação: detecção esperada em teste, sem credencial real. A ação inicial foi preservar o relatório redigido e demonstrar que a remoção do arquivo não resolve a presença no histórico. Para um vazamento real, a primeira medida seria revogar e rotacionar a credencial. O experimento local não altera o histórico do projeto.

No GitHub, a execução 41557834346 bloqueou a branch teste/quality-gate e publicou um achado redigido. A credencial foi criada aleatoriamente para esse teste, sem ser emitida por um provedor. Após confirmar sua origem, registramos uma única exceção em .gitleaksignore: `5c121fc1a74d8bf4ce5519e61d4a6efad1d58e15:credencial-ficticia.txt:github-pat:1`. A exceção corresponde somente à combinação de commit, arquivo, regra e linha desse valor fictício. Não ignora a regra github-pat, outros commits ou outros arquivos.

Essa ocorrência é classificada como falso positivo de credencial ativa no histórico após o teste controlado. A justificativa é a geração local do valor, sem criação de token no GitHub. A execução bloqueada e seu JSON original permanecem disponíveis. O scan posterior com todas as refs baixadas analisou o histórico e retornou zero segredos não excepcionados. A correção foi aplicada à main e validada na execução completa, porque o scanner examina também as outras refs do repositório.

## Semgrep

O código Node e os scripts são analisados com `p/default` e `p/owasp-top-ten`, usando `--error --strict`. Os relatórios não indicaram vulnerabilidades nesse código.

O bundle tem aproximadamente 1,24 MB e é gerado por ferramentas de frontend. O primeiro scan o pulou pelo limite padrão de tamanho. Aumentamos o limite para 10 MB e produzimos uma cópia formatada com Prettier. O original permanece inalterado. Os hashes das duas entradas e a cópia de análise acompanham o artifact.

O scan do bundle com regras gerais produziu timeouts em análises de fluxo, incluindo regras de AWS Lambda, Express e React, e avisos de parsing parcial no código gerado das bibliotecas. O relatório anterior está em `antes/sast`. Isso é um problema de cobertura, não um falso positivo de vulnerabilidade resolvido.

Na configuração final, o cliente recebe os dois rulesets exigidos e também `p/react`. Achados continuam bloqueantes por `--error`. Avisos de timeout ou parsing no cliente são preservados no JSON e aparecem no resumo; não são transformados em uma declaração de cobertura completa. O código do servidor mantém `--strict`. Erros de configuração ou execução continuam gerando falha quando o Semgrep retorna código não zero.

Classificação: limitação técnica que precisa ser considerada na revisão. Ação: manter os avisos visíveis e solicitar o fonte React para uma análise útil dos módulos originais. Não há comentários `nosemgrep`, regras ignoradas por identificador nem arquivo de supressão.

## Build e auditoria nativa

Os dez testes verificam a entrega do jogo, tipos de conteúdo, identidade do health check, integridade dos arquivos recebidos, proteção de caminhos internos, cabeçalhos, métodos HTTP, HEAD, query strings e entradas malformadas. Todos passaram na validação local.

O pacote tem o SHA do commit no nome e no arquivo de versão. A ordenação, os donos e os timestamps do tar são fixados para evitar diferenças causadas pelo computador que empacota. Um SHA-256 acompanha o arquivo.

O npm audit não indicou vulnerabilidades nas dependências instaladas pelo lock desta entrega. Isso não certifica as bibliotecas já compiladas dentro do bundle. A diferença é registrada para não confundir ausência de dependências de runtime no servidor com ausência de bibliotecas no jogo.

## Trivy fs e inventário do cliente

Os scanners `vuln,misconfig,secret` examinam o repositório, o lock de desenvolvimento e o Dockerfile. O relatório completo e o JSON filtrado em HIGH/CRITICAL estão disponíveis. O inventário parcial das quatro bibliotecas também tem relatório próprio.

Não foi criado `.trivyignore`. O uso de um SBOM montado a partir de versões identificáveis gera um aviso do próprio Trivy sobre possíveis imprecisões. A lista é parcial e sua origem está documentada. O procedimento correto para ampliar a cobertura é obter os manifests de origem, não esconder o aviso.

## Trivy image: seis ocorrências HIGH corrigidas

O scan inicial da base de runtime encontrou os seguintes identificadores, todos com severidade HIGH e correção disponível:

- CVE-2026-102276 e CVE-2026-102278, em `brace-expansion` 5.0.9.
- CVE-2026-109383, CVE-2026-109869, CVE-2026-19534 e CVE-2026-87018, em `undici` 6.28.0.

Os caminhos apontavam para `usr/local/lib/node_modules/npm/node_modules`. Esses pacotes vieram do npm da imagem base; não eram dependências do servidor HTTP.

Classificação: vulnerabilidades reais nos pacotes distribuídos pelo runtime. Ação: remover npm e Yarn do estágio final, porque nenhum deles é necessário para iniciar o servidor. A correção foi feita na preparação local da base e está no Dockerfile entregue. O scan foi repetido sobre a imagem publicada do Blackout. Os relatórios antes/depois foram preservados.

Resultado: o JSON filtrado da imagem final tem zero ocorrências HIGH/CRITICAL corrigíveis. O relatório completo continua disponível para verificar as outras severidades. O identificador da imagem local não é apresentado como digest de um pacote já publicado no GHCR.

## OWASP ZAP: cabeçalhos corrigidos

Para medir o efeito dos cabeçalhos no mesmo jogo, uma instância local de comparação foi criada na porta 3002, com os mesmos arquivos do Blackout e sem o conjunto de cabeçalhos do servidor. Ela não é uma captura da configuração original da Hostinger. O scan final usa a instância endurecida na porta 3000.

Os alertas Medium `10038`, ausência de CSP, e `10020`, ausência de proteção contra clickjacking, foram tratados. Também foram tratados `10021`, ausência de nosniff, `10063`, ausência de Permissions-Policy, e `90004`, cabeçalhos de isolamento ausentes.

Classificação: falhas reais na instância de comparação. Ação: definir CSP restritiva, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, política de permissões e COEP/COOP/CORP no servidor. Os testes verificam que esses cabeçalhos também aparecem em respostas de erro. Resultado: zero alertas High ou Medium no scan final do jogo.

## Alertas mantidos do ZAP

Alerta `2`, Low, Private IP Disclosure. Evidência: `192.168.1.5`, no JavaScript do jogo. O valor faz parte da atividade didática intitulada “Captura SOC - gateway loja 042”, com pacotes simulados de DNS, TLS e outras conexões. Classificação: falso positivo para vazamento da infraestrutura desta entrega. Ação: manter o conteúdo didático e registrar o contexto, sem suprimir o alerta.

Alerta `10096`, Low, Timestamp Disclosure. Evidência: `1831565813`, no mesmo bundle. O trecho é a soma de uma constante no gerador numérico `MathUtils.seededRandom` do Three.js, não um timestamp produzido pelo servidor. Classificação: falso positivo. Ação: preservar o bundle e a evidência.

Alerta `10049`, Informational, Non-Storable Content. Evidência: `Cache-Control: no-store`. Classificação: comportamento intencional desta configuração. Ação: manter sem supressão. Uma melhoria futura é usar cache imutável apenas para os assets com hash no nome, preservando no-store para estado e health check.

Alerta `10109`, Informational, Modern Web Application. Evidência: script JavaScript em modo module. Classificação: informação sobre a arquitetura do cliente, sem vulnerabilidade demonstrada. Ação: nenhuma alteração necessária.

## Aprovação e produção

A aprovação foi registrada pela conta 09780987. O deploy dep-dbkjbaff3r2c73f2baug terminou em 2026-11-03T01:15:37.143349Z. A URL pública é https://operacao-blackout-rm565098-rm565963.onrender.com. O JSON da aprovação e o relatório do deploy acompanham os artifacts.

O workflow verificou o registro de aprovação antes de acessar o Render. A chave ficou no secret do environment. A imagem foi promovida pelo digest e a verificação HTTP confirmou o mesmo commit em produção.

## Lições aprendidas

1. Um npm audit limpo no projeto não significa que a imagem esteja livre de pacotes vulneráveis. As seis ocorrências HIGH vieram do npm da base.
2. Excluir um arquivo do último commit não remove um segredo do histórico. O teste do Gitleaks mostrou o bloqueio nas duas situações.
3. Um build minificado pode ser inadequado para uma análise estática completa. A ausência de achados deve ser lida junto com os timeouts e avisos de parsing.
4. O lockfile precisa corresponder ao código analisado. O lock do empacotador não descreve automaticamente bibliotecas já embutidas em um jogo recebido pronto.
5. Alertas de IP e timestamp precisam de contexto. Neste caso, o primeiro era dado didático e o segundo era uma constante matemática.
6. O endurecimento de cabeçalhos foi verificado com o mesmo jogo antes e depois, e o navegador confirmou que o cenário 3D continuou funcionando.
7. A separação entre SHA do código, ID local da imagem e digest do registry evita afirmar que um artefato foi publicado quando houve apenas um build local.
8. O tempo do SAST foi o maior problema na preparação local. Os scans do bundle chegaram a levar vários minutos e não deram cobertura completa. Os tempos de cada job estão nos metadados da execução completa. Eles variam com filas, downloads e tamanho da entrada.
9. Aprovação é uma decisão registrada por uma pessoa após consultar os relatórios. O pipeline não deve preencher esse registro por conta própria.

## Ajustes confirmados na consolidação

A execução bloqueada mostrou que actions/download-artifact extrai um único artifact diretamente em reports, enquanto várias correspondências criam subpastas por nome. O resumo foi ajustado para ler os dois formatos. Também foi corrigido o texto da etapa 8: quando não existe aprovação concluída, ele informa a pendência em vez de mostrar uma frase genérica que poderia sugerir aprovação. A execução completa confirmou os dois comportamentos. O relatório do teste bloqueado foi mantido como evidência.


## Privacidade da publicação

Um e-mail pessoal foi identificado nos metadados da primeira publicação. Esse histórico foi isolado em um repositório privado e a publicação pública foi recriada com o endereço protegido do GitHub. As execuções, relatórios e prints incluídos aqui pertencem ao histórico público novo. Nomes e RMs foram mantidos por solicitação da dupla. A chave do Render fica em secret e não compõe os artifacts. Os e-mails e IPs das atividades do jogo são dados simulados do material recebido.
