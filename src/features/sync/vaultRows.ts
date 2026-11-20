import { z } from 'zod';
import { VaultSchema, type Vault } from '@/domain/models';

/** A row of `public.vaults` (supabase/migrations). Times are ISO strings there, milliseconds here. */
const RowSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  place_ids: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type VaultRow = z.infer<typeof RowSchema>;
/** What the phone sends: the server fills in the owner and `updated_at`. */
export type VaultUpload = Omit<VaultRow, 'updated_at'>;

export function toVaultRow(vault: Vault): VaultUpload {
  return {
    id: vault.id,
    name: vault.name,
    emoji: vault.emoji ?? null,
    place_ids: vault.placeIds,
    created_at: new Date(vault.createdAt).toISOString(),
    // Uploading a vault means it exists: this also brings back one deleted on another phone.
    deleted_at: null,
  };
}

export interface RemoteVaultChange {
  id: string;
  updatedAt: string;
  /** Undefined when the row was deleted. */
  vault?: Vault;
}

/** Untrusted like anything off the network: a row that doesn't parse is skipped. */
export function fromVaultRow(raw: unknown): RemoteVaultChange | undefined {
  const row = RowSchema.safeParse(raw);
  if (!row.success) return undefined;
  const r = row.data;
  if (r.deleted_at) return { id: r.id, updatedAt: r.updated_at };
  const vault = VaultSchema.safeParse({
    id: r.id,
    name: r.name,
    emoji: r.emoji ?? undefined,
    placeIds: r.place_ids,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  });
  return vault.success ? { id: r.id, updatedAt: r.updated_at, vault: vault.data } : undefined;
}
