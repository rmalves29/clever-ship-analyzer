type UnknownRecord = Record<string, unknown>;

export type WhatsappGroupSnapshot = {
  name: string;
  participantCount: number;
  participants: UnknownRecord[];
  inviteLink: string | null;
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function candidates(payload: unknown): UnknownRecord[] {
  const root = record(payload);
  if (!root) return [];
  const nestedKeys = ["data", "group", "groupInfo", "GroupInfo", "metadata", "groupMetadata", "GroupMetadata"];
  const rows = [root];
  let frontier = [root];
  for (let depth = 0; depth < 3; depth++) {
    const next: UnknownRecord[] = [];
    for (const row of frontier) {
      for (const key of nestedKeys) {
        const nested = record(row[key]);
        if (nested && !rows.includes(nested)) {
          rows.push(nested);
          next.push(nested);
        }
      }
    }
    frontier = next;
  }
  return rows;
}

function firstText(rows: UnknownRecord[], keys: string[]): string | null {
  for (const key of keys) {
    for (const row of rows) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function firstNumber(rows: UnknownRecord[], keys: string[]): number | null {
  for (const row of rows) {
    for (const key of keys) {
      const value = Number(row[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}

function firstParticipants(rows: UnknownRecord[]): UnknownRecord[] | null {
  for (const row of rows) {
    for (const key of ["Participants", "participants", "Members", "members"]) {
      const value = row[key];
      if (Array.isArray(value)) return value.flatMap((item) => (record(item) ? [record(item)!] : []));
    }
  }
  return null;
}

/** A listagem geral da UazAPI pode manter o nome anterior depois de uma renomeação. O endpoint
 *  de detalhes é a fonte prioritária para nome, participantes e link atuais do WhatsApp. */
export function currentWhatsappGroupSnapshot(listRow: unknown, detailPayload: unknown): WhatsappGroupSnapshot {
  const listRows = candidates(listRow);
  const detailRows = candidates(detailPayload);
  const participants = firstParticipants(detailRows) ?? firstParticipants(listRows) ?? [];
  const detailedParticipants = firstParticipants(detailRows);
  const fallbackCount =
    firstNumber(detailRows, ["ParticipantsCount", "participantsCount", "participant_count", "size"]) ??
    firstNumber(listRows, ["ParticipantsCount", "participantsCount", "participant_count", "size"]) ??
    0;

  return {
    name:
      firstText(detailRows, ["Subject", "subject", "Name", "name", "GroupName", "groupName", "group_name", "Title", "title"]) ??
      firstText(listRows, ["Subject", "subject", "Name", "name", "GroupName", "groupName", "group_name", "Title", "title"]) ??
      "Grupo sem nome",
    participantCount: detailedParticipants ? detailedParticipants.length : fallbackCount,
    participants,
    inviteLink:
      firstText(detailRows, ["inviteLink", "invite_link", "InviteLink", "inviteURL", "inviteUrl"]) ??
      firstText(listRows, ["inviteLink", "invite_link", "InviteLink", "inviteURL", "inviteUrl"]),
  };
}

export function whatsappParticipantPhone(participant: UnknownRecord): string {
  const value =
    participant["PhoneNumber"] ??
    participant["phoneNumber"] ??
    participant["phone"] ??
    participant["JID"] ??
    participant["jid"] ??
    participant["id"] ??
    "";
  return String(value).replace(/@.*$/, "");
}

export function whatsappParticipantIsAdmin(participant: UnknownRecord): boolean {
  return Boolean(
    participant["IsAdmin"] ||
      participant["IsSuperAdmin"] ||
      participant["isAdmin"] ||
      participant["isSuperAdmin"] ||
      participant["is_admin"] ||
      participant["admin"],
  );
}
