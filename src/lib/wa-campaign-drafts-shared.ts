import { z } from "zod";

/** Formulário da tela "Nova campanha" como fica salvo no rascunho. */
export const campaignDraftFormSchema = z.object({
  audience: z.string().max(200).default("sem_recompra"),
  templateName: z.string().max(200).default(""),
  params: z.array(z.string().max(2000)).max(20).default([]),
  coupon: z.string().max(100).default(""),
  tag: z.string().max(100).default(""),
  requireApproval: z.boolean().default(false),
  scheduleOn: z.boolean().default(false),
  scheduledAt: z.string().max(40).default(""),
});

export type CampaignDraftForm = z.infer<typeof campaignDraftFormSchema>;

export type CampaignDraftRow = {
  id: string;
  name: string;
  form: CampaignDraftForm;
  createdAt: string;
  updatedAt: string;
};

export const saveDraftInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200),
  form: campaignDraftFormSchema,
});
