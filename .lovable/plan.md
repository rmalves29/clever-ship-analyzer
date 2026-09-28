# Melhorar resultados das pesquisas

## Alterações
- Substituir os gráficos verticais por listas de barras horizontais responsivas.
- Exibir rótulo completo, quantidade e percentual sem depender de tooltip.
- Calcular respostas válidas e registros sem resposta por pergunta.
- Ordenar opções por volume, mantendo opções sem respostas ao final; preservar a ordem de Sim/Não e notas de 1 a 5.
- Sinalizar que múltipla escolha pode superar 100% por usar respondentes válidos como base.
- Manter intactas a tabela individual e a exportação CSV.

## Validação
- Conferir a aba Respostas em desktop e celular no preview.
- Validar textos longos, emojis, ausência de overflow e estados com zero respostas.
- Confirmar typecheck e o estado do build.

## Detalhes técnicos
- A agregação continuará no navegador a partir das respostas reais já carregadas.
- Uma resposta válida será texto não vazio ou seleção com pelo menos um valor não vazio.
- Opções desconhecidas presentes em respostas antigas serão preservadas na visualização após as opções configuradas.
