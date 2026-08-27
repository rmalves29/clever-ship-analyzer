-- Permite reaproveitar a mesma campanha entre execuções sucessivas do tick de automação:
-- cada disparo direto (sem aprovação) de uma etapa de envio soma no mesmo registro em vez
-- de criar uma campanha nova por execução do tick.
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS automation_step_id text;
