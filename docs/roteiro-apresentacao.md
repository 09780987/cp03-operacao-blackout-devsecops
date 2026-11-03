# Demonstração de até dez minutos

Mateus Kalil - RM565098. Leonardo Lago Garroti - RM565963.

Este roteiro acompanha a entrega caso o professor solicite a apresentação. Os trechos de GitHub e produção dependem da publicação real descrita em `publicacao.md`.

1. De 0:00 a 1:00: apresentar o Operação Blackout, a dupla e uma rodada rápida. Explicar que a segurança acompanha o caminho do código até o deploy.
2. De 1:00 a 2:00: abrir o workflow e mostrar o encadeamento por `needs`, as permissões mínimas e os nomes dos artifacts.
3. De 2:00 a 3:00: abrir a execução bloqueada. Mostrar o relatório redigido do Gitleaks e explicar por que apagar o último arquivo não remove o histórico.
4. De 3:00 a 4:00: mostrar Semgrep, os testes e o lock. Explicar que a aplicação não precisa de bibliotecas de terceiros.
5. De 4:00 a 5:30: comparar o Trivy fs com o Trivy image. Mostrar as seis ocorrências HIGH antes da remoção do npm e o JSON filtrado vazio depois.
6. De 5:30 a 6:30: abrir os relatórios do ZAP. Mostrar os cabeçalhos de isolamento corrigidos e justificar o alerta informativo de cache que foi preservado.
7. De 6:30 a 8:00: abrir o pacote por SHA e digest. Mostrar a revisão e o relatório do deploy. Não aprovar uma execução sem consultar os sete relatórios anteriores.
8. De 8:00 a 9:00: abrir a URL HTTPS em produção e `/health`. Comparar a versão e o digest com a execução aprovada.
9. De 9:00 a 10:00: abrir o Summary completo, resumir os achados e falar sobre as melhorias propostas.
