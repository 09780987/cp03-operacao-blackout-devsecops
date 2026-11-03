# Como funciona a esteira

Integrantes: Mateus Kalil, RM565098; Leonardo Lago Garroti, RM565963.

## Disparo e permissões

O arquivo `.github/workflows/devsecops.yml` responde a push, pull request para a main e execução manual. O encadeamento é feito por `needs`. No topo, a única permissão é `contents: read`. Apenas o job `docker-build` recebe `packages: write`. Os jobs que baixam a imagem recebem `packages: read`; produção recebe `actions: read` para consultar a aprovação. A chave Render é um Environment secret liberado somente após a revisão.

Todos os checkouts desativam a persistência de credenciais. O checkout do Gitleaks usa `fetch-depth: 0`. O agrupamento por branch evita deploys concorrentes. Um novo push de código cancela a execução anterior da mesma branch, para que uma revisão antiga não seja promovida.

## 1. Secrets com Gitleaks

Há uma única exceção em `.gitleaksignore`, limitada ao fingerprint da credencial fictícia do teste controlado. A justificativa e a execução bloqueada estão nas observações. O histórico e as outras refs continuam no escopo.

O job `secrets-scan` executa `gitleaks git /repo` no histórico baixado pelo checkout, com `--redact`, relatório JSON e `--exit-code 1`. O artifact é `relatorio-01-gitleaks`. Uma descoberta impede a execução do SAST.

O experimento local em `scripts/gate-demo.sh` cria um repositório temporário com credencial fictícia, comprova o bloqueio e mostra que apagar apenas o arquivo no último commit não limpa o histórico. A conclusão é validada em uma branch órfã com histórico limpo. O script apaga somente o diretório temporário que criou. Ele não altera o histórico do projeto.

## 2. SAST com Semgrep

O servidor e os scripts passam pelos rulesets `p/default` e `p/owasp-top-ten`, com `--error --strict --json`. O cliente recebe esses dois rulesets e `p/react`, com `--error --json`. Uma cópia formatada do bundle é gerada com Prettier 3.9.10, instalado pelo lock; ela permite ao scanner processar o arquivo sem alterar o que o navegador executa. O limite é de 10 MB. O original é excluído apenas da análise em duplicidade. A cópia e os hashes das duas entradas são publicados no artifact.

O bundle gerado produziu timeouts em regras de fluxo de dados. Por isso, os avisos do cliente são preservados e contados no resumo, enquanto o código Node mantém o modo estrito. Achados bloqueiam a esteira; a ausência de achados com avisos não é apresentada como cobertura completa. O projeto-fonte React é necessário para ampliar a qualidade da análise. O artifact `relatorio-02-semgrep` reúne os relatórios do servidor, do cliente e o JSON consolidado. Não há regras suprimidas por identificador.

O executável e a imagem são fixos, mas os dois rulesets públicos são consultados no Registry e podem evoluir. O relatório JSON guarda a versão e as regras efetivamente utilizadas. Uma melhoria futura é versionar também um snapshot revisado das regras.

## 3. Build, dependências, testes e pacote

O job `build` configura Node 24.22.2, executa `npm ci --ignore-scripts`, registra `npm ls --all`, produz `npm-audit.json`, executa os testes e gera `dist`. O pacote `blackout-SHA.tar.gz` contém os arquivos executáveis e `version.json`. Um arquivo SHA-256 acompanha o pacote.

Há dois artifacts: `relatorio-03-build` para os relatórios e `artefato-aplicacao-SHA` para o pacote versionado. A auditoria aceita exit code 1 por achados, porque o bloqueio de dependências pertence à etapa 4. Um erro operacional maior continua interrompendo o job. Os dez testes cobrem a integridade dos arquivos recebidos, a entrega dos assets, MIME types, health check, cabeçalhos, métodos HTTP, HEAD, caminhos internos e entradas malformadas. O teste no navegador verifica a abertura, o início do cenário 3D e a navegação.

## 4. SCA com Trivy fs

O job `sca` roda dois scans sobre a raiz: o primeiro gera `trivy-fs.txt` com todas as severidades; o segundo gera `trivy-fs.json`, filtrado em HIGH/CRITICAL, e usa `--exit-code 1`. Os scanners são `vuln,misconfig,secret`. O artifact é `relatorio-04-trivy-sca`.

Os diretórios de documentação, relatórios, distribuição e trabalho são excluídos porque não compõem os manifests nem o código entregue à imagem. O Dockerfile e o lock continuam no escopo. O servidor não possui dependências npm de terceiros em runtime. O Prettier, usado no SAST, tem versão exata no package-lock.json e também entra na análise de dependências. O jogo recebido tem bibliotecas embutidas no bundle; um scan adicional com `trivy sbom` verifica o inventário parcial em `config/bundle.cdx.json` e publica `trivy-bundle.txt` e `trivy-bundle.json`. React, React DOM, Three.js e React Three Fiber foram identificados por versões explícitas. O projeto React original e seu lockfile não foram fornecidos, portanto não há cobertura completa das dependências do cliente.

## 5. Imagem e GHCR

O job `docker-build` executa somente na main após a etapa 4. Converte `owner/repo` para minúsculas, autentica com `GITHUB_TOKEN`, constrói a imagem com Buildx e publica a tag igual ao SHA completo. Não publica `latest`.

O build inclui os labels de origem e revisão, proveniência e SBOM. A saída do Buildx fornece o digest. O relatório registra a tag, o digest e o manifesto em texto e JSON. O artifact é `relatorio-05-docker-build`.

O Dockerfile usa dois estágios, base Alpine fixada por digest, usuário não-root, health check e lista de arquivos permitidos no `.dockerignore`. Não recebe segredos por ARG ou ENV. npm e Yarn são removidos do estágio final, pois o servidor usa apenas o binário Node e seus módulos nativos.

## 6. Scan da imagem

O job `image-scan` recebe o nome e o digest produzidos na etapa 5. Executa `trivy image --image-src remote`, sem reconstruir a imagem. Credenciais de leitura do GHCR são repassadas por `TRIVY_USERNAME` e `TRIVY_PASSWORD`, e não por argumentos com os valores.

O relatório completo `trivy-image.txt` inclui todas as severidades e achados sem correção. O JSON bloqueante filtra HIGH/CRITICAL e usa `--ignore-unfixed --exit-code 1`. O artifact é `relatorio-06-trivy-image`. A imagem local foi analisada por tar exportado pelo Docker; essa análise não comprova publicação no GHCR.

## 7. Homologação e DAST

O job `dast-staging` usa o environment `homologacao`. Sobe o digest aprovado no próprio runner, com filesystem somente leitura, capabilities removidas e `no-new-privileges`. A porta é vinculada a 127.0.0.1. Um health check HTTP precisa passar antes do scan.

O ZAP Baseline roda em uma imagem fixada, com rede host para alcançar o jogo do próprio runner. Gera `report_html.html`, `report_json.json` e `report_md.md`, além do log. Achados não bloqueiam a promoção; uma falha operacional que impeça o relatório bloqueia. O contêiner é removido em um passo com `if: always()`. O artifact é `relatorio-07-homologacao-zap`.

## 8. Revisão e produção

O job deploy-prod referencia o environment producao. O GitHub mantém o job em espera até a aprovação da conta designada como revisora. O histórico de aprovação é consultado antes de qualquer acesso ao Render; se o registro não existir, a execução falha.

A integração usa o secret RENDER_API_KEY e as variables RENDER_OWNER_ID e RENDER_SERVICE_NAME. A chave pertence à conta Render e fica criptografada no environment, sem entrar em arquivos do projeto. O script restringe sua operação ao workspace, ao serviço e à imagem deste repositório. O plano solicitado e confirmado é Free.

Depois da revisão, scripts/deploy-render.mjs procura o serviço pelo nome no workspace. Se ele ainda não existir, cria um web service baseado na imagem aprovada; caso já exista, atualiza o mesmo serviço. O primeiro deploy também acontece dentro dessa etapa protegida. As próximas promoções são manuais pela esteira, com autodeploy do Render desligado.

A API recebe o digest, não uma tag mutável. O job espera o estado live, confere a referência ou o digest retornado pelo Render e verifica HTTP 200 em /health, nome da aplicação e versão igual ao SHA aprovado. A versão está gravada em version.json dentro da imagem; não depende de uma variável preenchida depois do build. A porta do health check acompanha PORT.

O artifact relatorio-08-producao contém a aprovação, o resultado do Render, a resposta de saúde e o relatório com imagem, responsável, data, URL e execução. Se a criação ou a verificação falhar, o job falha e publica os arquivos disponíveis, sem declarar sucesso.

## Resumo e interpretação de falhas

O job `pipeline-summary` depende das oito etapas e usa `if: always()`. Baixa os artifacts por nome, extrai contagens com `jq`, escreve a tabela em `$GITHUB_STEP_SUMMARY` e publica `resumo-esteira.md` como `resumo-da-esteira`.

Um relatório ausente é identificado como indisponível. Os estados vêm de `needs.JOB.result`; por isso, falha, cancelamento e etapa pulada continuam visíveis. A tabela é obrigatória no Summary do GitHub e no README; o PDF da entrega usa somente texto, conforme solicitado.

Há evidências locais e do GitHub Actions. A execução 41557869924 concluiu as oito etapas e o resumo. O registro da aprovação e a verificação do deploy estão no artifact relatorio-08-producao.

## Resumo antes da aprovação

Um job adicional, resumo-pre-aprovacao, depende somente das etapas 1 a 7 e também roda em caso de falha. Ele publica resumo-parcial-pre-aprovacao para a pessoa revisora consultar antes do deploy. O resumo final continua dependendo das oito etapas, como solicitado. A existência do resumo parcial não é apresentada como prova de uma execução completa.
