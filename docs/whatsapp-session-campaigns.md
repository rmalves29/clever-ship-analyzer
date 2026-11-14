# Campanhas com mensagem livre

Na tela **WhatsApp → Campanhas → Nova campanha**, escolha **Tipo de envio → Mensagem livre · janela de 24h**. Selecione o segmento, escreva o texto (até 4096 caracteres, com links e quebras de linha) e confira a prévia. O texto e o tipo de envio também ficam salvos nos rascunhos.

O público contado nesse modo exclui quem não tem janela aberta e quem recusou marketing. A fila usa a mesma exclusão de opt-outs das campanhas de marketing, confere a janela novamente imediatamente antes de chamar a Meta e não converte mensagens expiradas em templates. Agendamento e aprovação continuam disponíveis; se a janela vencer antes do envio, a mensagem falha sem nova tentativa automática.

Não há migração de banco: o modo usa o marcador reservado `__session_text__` no campo existente de modelo e armazena o texto no primeiro parâmetro do corpo. Esse marcador é interno e nunca é enviado como nome de template à Meta. Campanhas antigas continuam no caminho de templates.

Depois de sincronizar o GitHub no Lovable, publique a aplicação completa, incluindo o servidor/worker. Só então abra o rascunho salvo, selecione o novo tipo de envio e insira o texto aprovado. Esta alteração de código não dispara campanhas.

Verificação automatizada: `npx vitest run --config vitest.session.config.ts`. Conferir também a compilação com `npm run build`.

Verificação manual após publicar: salvar e reabrir um rascunho de texto livre; conferir texto e link na prévia; enviar para um contato de teste com janela aberta; confirmar registro em Conversas; testar contato sem janela e opt-out, que não devem receber. Repetir a prévia de uma campanha antiga de template.
