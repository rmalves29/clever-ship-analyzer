import { Gift, X } from "lucide-react";
import type { PopupDesignConfig } from "@/lib/popup-designer";

export type PopupPreviewStage = "capture" | "name" | "phone" | "result";

type PreviewCampaign = {
  headline: string;
  body_text: string;
  button_text: string;
  image_url: string;
  collect_name: boolean;
  coupon_mode: "none" | "fixed" | "unique";
  fixed_coupon_code: string;
};

function Wheel({ design }: { design: PopupDesignConfig }) {
  const prizes = design.wheelPrizes.slice(0, 8);
  const palette = ["#f1b93b", "#183b56", "#f0f3f4", "#cf7b53", "#8fb9a8", "#edd7ad", "#d7ff52", "#ef9cad"];
  const step = 360 / prizes.length;
  const gradient = prizes
    .map((prize, index) => `${prize.color || palette[index % palette.length]} ${index * step}deg ${(index + 1) * step}deg`)
    .join(", ");

  return (
    <div className="relative mx-auto aspect-square w-[78%] min-w-[160px] max-w-[270px] rounded-full border-[10px] border-white shadow-xl">
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
      <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-slate-900 shadow-lg" />
      <div className="absolute -right-3 top-1/2 h-0 w-0 -translate-y-1/2 border-b-[12px] border-l-[18px] border-t-[12px] border-b-transparent border-l-white border-t-transparent drop-shadow" />
      {prizes.map((prize, index) => {
        const angle = index * step + step / 2;
        const radius = 36;
        const x = 50 + Math.cos(((angle - 90) * Math.PI) / 180) * radius;
        const y = 50 + Math.sin(((angle - 90) * Math.PI) / 180) * radius;
        return (
          <span
            key={`${prize.label}-${index}`}
            className="absolute max-w-[64px] text-center text-[9px] font-black uppercase leading-tight text-slate-900"
            style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
          >
            {prize.label}
          </span>
        );
      })}
    </div>
  );
}

function CaptureContent({ campaign, design, stage }: { campaign: PreviewCampaign; design: PopupDesignConfig; stage: PopupPreviewStage }) {
  const progressive = design.journey === "progressive";
  const showName = campaign.collect_name && (!progressive || stage === "name" || stage === "capture");
  const showPhone = !progressive || stage === "phone" || stage === "capture";
  const buttonText = progressive && stage === "name" ? "CONTINUAR" : campaign.button_text;

  return (
    <div className="flex h-full flex-col justify-center px-7 py-8 text-center md:px-10">
      {design.badgeText && (
        <span
          className="mx-auto mb-3 inline-flex w-fit rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ borderColor: `${design.textColor}22`, color: design.textColor }}
        >
          {design.badgeText}
        </span>
      )}
      <h3 className="text-balance text-2xl font-black leading-[1.05] md:text-[28px]" style={{ color: design.textColor }}>
        {campaign.headline}
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed" style={{ color: design.mutedColor }}>
        {campaign.body_text}
      </p>
      <div className="mt-5 space-y-2">
        {showName && (
          <div className="flex h-11 items-center rounded-lg border bg-white px-4 text-left text-sm text-slate-400 shadow-sm">
            {design.namePlaceholder}
          </div>
        )}
        {showPhone && (
          <div className="flex h-11 items-center rounded-lg border bg-white px-4 text-left text-sm text-slate-400 shadow-sm">
            {design.inputPlaceholder}
          </div>
        )}
        <div
          className="flex h-11 items-center justify-center rounded-lg px-4 text-xs font-black uppercase tracking-wide shadow-md"
          style={{ backgroundColor: design.buttonColor, color: design.buttonTextColor }}
        >
          {buttonText}
        </div>
      </div>
      {progressive && (
        <p className="mt-2 text-[10px]" style={{ color: design.mutedColor }}>
          {stage === "name" ? "Etapa 1" : stage === "phone" ? "Etapa 2" : "Jornada progressiva"}
        </p>
      )}
    </div>
  );
}

function ResultContent({ campaign, design }: { campaign: PreviewCampaign; design: PopupDesignConfig }) {
  const coupon = campaign.coupon_mode === "fixed" && campaign.fixed_coupon_code ? campaign.fixed_coupon_code : "BEMVINDA15";
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-10 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: `${design.accentColor}55` }}>
        <Gift className="size-5" style={{ color: design.textColor }} />
      </div>
      <h3 className="text-2xl font-black leading-tight" style={{ color: design.textColor }}>{design.resultHeadline}</h3>
      <p className="mt-3 max-w-sm text-sm" style={{ color: design.mutedColor }}>{design.resultBody}</p>
      {campaign.coupon_mode !== "none" && (
        <div className="mt-6 w-full rounded-xl border-2 border-dashed px-5 py-4" style={{ borderColor: design.accentColor }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: design.mutedColor }}>Seu cupom</p>
          <p className="mt-1 text-xl font-black tracking-wider" style={{ color: design.textColor }}>{coupon}</p>
        </div>
      )}
      <div className="mt-3 flex h-11 w-full items-center justify-center rounded-lg text-xs font-black uppercase" style={{ backgroundColor: design.buttonColor, color: design.buttonTextColor }}>
        {design.resultButtonText}
      </div>
    </div>
  );
}

export function PopupPreview({
  campaign,
  design,
  viewport = "desktop",
  stage = "capture",
  compact = false,
}: {
  campaign: PreviewCampaign;
  design: PopupDesignConfig;
  viewport?: "desktop" | "mobile";
  stage?: PopupPreviewStage;
  compact?: boolean;
}) {
  const isMobile = viewport === "mobile";
  const split = !isMobile && design.layout === "split" && design.imagePosition !== "top";
  const showImage = Boolean(campaign.image_url) && design.imagePosition !== "none" && stage !== "result" && design.interaction !== "wheel";
  const imageFirst = design.imagePosition === "left";
  const maxWidth = compact ? Math.min(design.width, 520) : design.width;
  const firstProgressiveStage: PopupPreviewStage = campaign.collect_name ? "name" : "phone";
  const stageForProgressive = stage === "capture" && design.journey === "progressive" ? firstProgressiveStage : stage;

  const visual = stage === "result" ? (
    <ResultContent campaign={campaign} design={design} />
  ) : design.interaction === "wheel" ? (
    <div className={`grid h-full ${isMobile ? "grid-cols-1" : "grid-cols-[0.9fr_1.1fr]"}`}>
      <div className="flex items-center justify-center p-5"><Wheel design={design} /></div>
      <CaptureContent campaign={campaign} design={design} stage={stageForProgressive} />
    </div>
  ) : split ? (
    <div className="grid h-full grid-cols-2">
      {imageFirst && showImage && <img src={campaign.image_url} alt="" className="h-full min-h-[330px] w-full object-cover" />}
      <CaptureContent campaign={campaign} design={design} stage={stageForProgressive} />
      {!imageFirst && showImage && <img src={campaign.image_url} alt="" className="h-full min-h-[330px] w-full object-cover" />}
    </div>
  ) : (
    <div>
      {showImage && <img src={campaign.image_url} alt="" className="h-40 w-full object-cover" />}
      <CaptureContent campaign={campaign} design={design} stage={stageForProgressive} />
    </div>
  );

  return (
    <div
      className="relative overflow-hidden border shadow-2xl"
      style={{
        width: isMobile ? Math.min(350, maxWidth) : maxWidth,
        maxWidth: "100%",
        minHeight: compact ? 250 : 330,
        borderRadius: design.borderRadius,
        borderColor: design.accentColor,
        backgroundColor: design.backgroundColor,
      }}
    >
      {!compact && (
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow"
          aria-label="Fechar prévia"
        >
          <X className="size-4" />
        </button>
      )}
      {visual}
    </div>
  );
}
