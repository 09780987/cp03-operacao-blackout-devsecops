# Publicação e operação no Render

## Projeto configurado

Repositório: https://github.com/09780987/cp03-operacao-blackout-devsecops

A esteira usa um web service baseado em imagem no Render, com plano Free, uma instância e health check em /health. A imagem é publicada no GHCR com o SHA do commit e promovida pelo digest. A conta GitHub 09780987 faz a publicação e está definida como revisora do environment producao.

## Configuração do GitHub

O environment homologacao executa o jogo no runner para o ZAP. O environment producao exige revisão da conta designada, aceita somente a main e está com bypass administrativo desabilitado.

No environment producao, configure:

- Secret RENDER_API_KEY: chave da conta Render, armazenada criptografada pelo GitHub.
- Variable RENDER_OWNER_ID: identificador do workspace que pertence ao projeto.
- Variable RENDER_SERVICE_NAME: operacao-blackout-rm565098-rm565963.

A chave da conta Render foi criada para esta integração. Seu valor não está no código, nos relatórios ou no ZIP. O workflow só recebe esse secret depois que a proteção do environment é atendida. O código valida o workspace, o nome do serviço, a imagem deste repositório e o plano gratuito antes de promover a versão.

A criação e as próximas atualizações usam a API oficial do Render. A etapa 8 cria o serviço, se ele ainda não existir, depois da aprovação. Nas execuções seguintes, reutiliza o mesmo serviço. O deploy não depende de uma conexão de escrita do Render com os repositórios GitHub: a origem é a imagem pública do GHCR.

## Disparar a esteira

Faça um push de código na main ou execute o workflow manualmente. Com GitHub CLI autenticado:

```bash
gh workflow run devsecops.yml --ref main
gh run list --workflow devsecops.yml
```

Mudanças somente em README, avisos de terceiros e docs não disparam outro deploy. Um novo push de código cancela a execução anterior da mesma branch, evitando promover uma revisão desatualizada. Os artifacts anteriores permanecem no histórico.

## Revisar e aprovar

A pessoa revisora consulta os relatórios 1 a 7 e o resumo parcial. Confira os segredos não excepcionados, os achados do SAST, os avisos de cobertura do cliente, os testes, os resultados do Trivy e os alertas do ZAP. A única exceção do Gitleaks corresponde ao fingerprint do valor fictício do teste, com justificativa em observacoes.md.

Na tela da execução, abra Review deployments, selecione producao, registre o motivo da decisão e aprove ou rejeite. Essa decisão precisa ser real. A configuração do environment e a existência da chave Render não equivalem a aprovação.

Depois da aprovação, o job consulta o histórico do GitHub antes de acessar a nuvem. O script deploy-render.mjs solicita o plano Free e envia ao Render a imagem pelo digest. O serviço fica com autodeploy desabilitado; as promoções passam pela esteira. O job espera o status live, confere o digest informado pelo Render e exige HTTP 200 com a versão do commit em /health. Também abre a página do jogo para confirmar seu conteúdo.

O artifact relatorio-08-producao contém aprovacao.json, render-deploy.json, health.json e deploy-producao.md. O resumo final só termina depois da etapa 8. Uma rejeição ou falha de deploy fica registrada, sem ser convertida em resultado limpo.

## Demonstração do gate

A branch teste/quality-gate introduziu uma credencial estritamente fictícia e gerou uma execução bloqueada. O Gitleaks varre o histórico completo e também encontra refs não mescladas. Por isso, a correção registra apenas o fingerprint dessa amostra gerada para o teste em .gitleaksignore. Nenhuma regra geral foi desligada. A main mantém a exceção documentada; a execução completa permite comparar o resultado com a branch bloqueada.

Para repetir o teste local com uma amostra nova, execute em Bash:

```bash
bash scripts/gate-demo.sh
```

O script trabalha em um repositório temporário. Demonstra o bloqueio, mostra que a remoção só do último commit não resolve e confirma o scan de um histórico limpo. Um segredo real exige revogação e rotação, além do tratamento do histórico.

## Registrar os resultados

Depois de uma execução completa de sucesso, use seu ID real:

```bash
gh run list --workflow devsecops.yml
read -r -p 'ID da execução completa: ' run
node scripts/registrar-execucao.mjs "$run"
```

O registrador consulta os jobs e a aprovação, baixa os artifacts e acrescenta os links ao README. A documentação final da entrega também guarda os metadados brutos, os hashes dos artifacts e os prints reais da execução, da revisão, de Packages e do jogo na nuvem.

## Rollback e manutenção

Para restaurar uma versão anterior, escolha um digest que já tenha sido aprovado e mantenha a revisão. Registre a decisão, o digest e o health check posterior. A tag latest não é usada como referência de promoção.

A chave Render pode ser substituída em Account settings e no Environment secret do GitHub. Antes de remover a chave antiga, confirme que a nova configuração funciona. O projeto-fonte React e seu lockfile devem ser recuperados para aprofundar SAST e SCA do cliente.
