export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_content_queue: {
        Row: {
          batch_id: string
          campaign_id: string
          campaign_name: string
          content_image_url: string | null
          content_text: string
          created_at: string
          envio_message_id: string | null
          id: string
          link_type: string | null
          link_url: string | null
          scheduled_date: string
          source_summary: string
          status: string
          time_of_day: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          campaign_id: string
          campaign_name: string
          content_image_url?: string | null
          content_text: string
          created_at?: string
          envio_message_id?: string | null
          id?: string
          link_type?: string | null
          link_url?: string | null
          scheduled_date: string
          source_summary: string
          status?: string
          time_of_day: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          campaign_id?: string
          campaign_name?: string
          content_image_url?: string | null
          content_text?: string
          created_at?: string
          envio_message_id?: string | null
          id?: string
          link_type?: string | null
          link_url?: string | null
          scheduled_date?: string
          source_summary?: string
          status?: string
          time_of_day?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_coupons: {
        Row: {
          batch_id: string
          code: string
          content_queue_item_id: string | null
          created_at: string
          ends_at: string
          error: string | null
          id: string
          percentage: number
          scheduled_date: string
          shopify_discount_id: string | null
          starts_at: string
          status: string
        }
        Insert: {
          batch_id: string
          code: string
          content_queue_item_id?: string | null
          created_at?: string
          ends_at: string
          error?: string | null
          id?: string
          percentage: number
          scheduled_date: string
          shopify_discount_id?: string | null
          starts_at: string
          status?: string
        }
        Update: {
          batch_id?: string
          code?: string
          content_queue_item_id?: string | null
          created_at?: string
          ends_at?: string
          error?: string | null
          id?: string
          percentage?: number
          scheduled_date?: string
          shopify_discount_id?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_coupons_content_queue_item_id_fkey"
            columns: ["content_queue_item_id"]
            isOneToOne: false
            referencedRelation: "ai_content_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_send_routines: {
        Row: {
          campaign_id: string
          campaign_name: string
          content_image_url: string | null
          content_text: string
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          id: string
          last_run_at: string | null
          next_run_at: string
          recurrence: string
          source_summary: string
          status: string
          time_of_day: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_name: string
          content_image_url?: string | null
          content_text: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          last_run_at?: string | null
          next_run_at: string
          recurrence: string
          source_summary: string
          status?: string
          time_of_day: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          content_image_url?: string | null
          content_text?: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          recurrence?: string
          source_summary?: string
          status?: string
          time_of_day?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_tick_runs: {
        Row: {
          automations_processed: number
          error: string | null
          finished_at: string | null
          id: string
          runs_processed: number
          started_at: string
        }
        Insert: {
          automations_processed?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          runs_processed?: number
          started_at?: string
        }
        Update: {
          automations_processed?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          runs_processed?: number
          started_at?: string
        }
        Relationships: []
      }
      crm_events: {
        Row: {
          canais: string[]
          category: string
          created_at: string
          description: string | null
          event_date: string
          id: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          canais?: string[]
          category: string
          created_at?: string
          description?: string | null
          event_date: string
          id?: string
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          canais?: string[]
          category?: string
          created_at?: string
          description?: string | null
          event_date?: string
          id?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_list_members: {
        Row: {
          adicionado_em: string
          customer_id: string
          id: string
          lista_id: string
        }
        Insert: {
          adicionado_em?: string
          customer_id: string
          id?: string
          lista_id: string
        }
        Update: {
          adicionado_em?: string
          customer_id?: string
          id?: string
          lista_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_list_members_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "crm_static_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_repurchase_attributions: {
        Row: {
          attribution_evidence: string
          attribution_reference: string
          campaign_id: string
          campaign_source: string
          channel: string | null
          conversion_window_days: number
          converted_at: string
          created_at: string
          customer_id: string
          evidence_payload: Json
          id: string
          order_id: string
          revenue: number
          sent_at: string
          stage: string
        }
        Insert: {
          attribution_evidence: string
          attribution_reference: string
          campaign_id: string
          campaign_source: string
          channel?: string | null
          conversion_window_days: number
          converted_at: string
          created_at?: string
          customer_id: string
          evidence_payload?: Json
          id?: string
          order_id: string
          revenue?: number
          sent_at: string
          stage: string
        }
        Update: {
          attribution_evidence?: string
          attribution_reference?: string
          campaign_id?: string
          campaign_source?: string
          channel?: string | null
          conversion_window_days?: number
          converted_at?: string
          created_at?: string
          customer_id?: string
          evidence_payload?: Json
          id?: string
          order_id?: string
          revenue?: number
          sent_at?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_repurchase_attributions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shopify_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_repurchase_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shopify_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_segments: {
        Row: {
          atualizado_em: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          regras: Json
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          regras?: Json
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          regras?: Json
        }
        Relationships: []
      }
      crm_static_lists: {
        Row: {
          criado_em: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      envio_auto_messages: {
        Row: {
          campaign_id: string | null
          content_text: string | null
          content_type: string
          created_at: string | null
          event_type: string
          group_id: string | null
          id: string
          is_active: boolean | null
          media_url: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          content_text?: string | null
          content_type?: string
          created_at?: string | null
          event_type: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          content_text?: string | null
          content_type?: string
          created_at?: string | null
          event_type?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_auto_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "envio_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_auto_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "envio_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_campaign_groups: {
        Row: {
          campaign_id: string
          created_at: string | null
          group_id: string
          id: string
          sort_order: number | null
          weight_percent: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          group_id: string
          id?: string
          sort_order?: number | null
          weight_percent?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          group_id?: string
          id?: string
          sort_order?: number | null
          weight_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_campaign_groups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "envio_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_campaign_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "envio_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_campaigns: {
        Row: {
          auto_spawn_enabled: boolean
          created_at: string | null
          description: string | null
          facebook_pixel_id: string | null
          group_template: Json | null
          id: string
          is_active: boolean | null
          is_entry_open: boolean | null
          last_spawn_at: string | null
          name: string
          slug: string
          spawn_margin: number
          updated_at: string | null
        }
        Insert: {
          auto_spawn_enabled?: boolean
          created_at?: string | null
          description?: string | null
          facebook_pixel_id?: string | null
          group_template?: Json | null
          id?: string
          is_active?: boolean | null
          is_entry_open?: boolean | null
          last_spawn_at?: string | null
          name: string
          slug: string
          spawn_margin?: number
          updated_at?: string | null
        }
        Update: {
          auto_spawn_enabled?: boolean
          created_at?: string | null
          description?: string | null
          facebook_pixel_id?: string | null
          group_template?: Json | null
          id?: string
          is_active?: boolean | null
          is_entry_open?: boolean | null
          last_spawn_at?: string | null
          name?: string
          slug?: string
          spawn_margin?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      envio_group_events: {
        Row: {
          created_at: string | null
          event_type: string
          group_id: string | null
          group_jid: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          group_id?: string | null
          group_jid?: string | null
          id?: string
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          group_id?: string | null
          group_jid?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_group_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "envio_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_group_events_backups: {
        Row: {
          created_at: string | null
          deleted_rows: number | null
          drive_file_id: string | null
          drive_file_name: string | null
          drive_file_size: number | null
          drive_file_url: string | null
          dry_run: boolean | null
          duration_ms: number | null
          id: string
          rows_exported: number | null
          success: boolean | null
        }
        Insert: {
          created_at?: string | null
          deleted_rows?: number | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_file_size?: number | null
          drive_file_url?: string | null
          dry_run?: boolean | null
          duration_ms?: number | null
          id?: string
          rows_exported?: number | null
          success?: boolean | null
        }
        Update: {
          created_at?: string | null
          deleted_rows?: number | null
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_file_size?: number | null
          drive_file_url?: string | null
          dry_run?: boolean | null
          duration_ms?: number | null
          id?: string
          rows_exported?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      envio_groups: {
        Row: {
          created_at: string | null
          group_jid: string
          group_name: string
          id: string
          invite_link: string | null
          is_active: boolean | null
          is_admin: boolean
          is_entry_open: boolean | null
          max_participants: number | null
          participant_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_jid: string
          group_name: string
          id?: string
          invite_link?: string | null
          is_active?: boolean | null
          is_admin?: boolean
          is_entry_open?: boolean | null
          max_participants?: number | null
          participant_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_jid?: string
          group_name?: string
          id?: string
          invite_link?: string | null
          is_active?: boolean | null
          is_admin?: boolean
          is_entry_open?: boolean | null
          max_participants?: number | null
          participant_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      envio_link_clicks: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          envio_message_id: string | null
          id: string
          ip_hash: string | null
          redirected_group_id: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          envio_message_id?: string | null
          id?: string
          ip_hash?: string | null
          redirected_group_id?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          envio_message_id?: string | null
          id?: string
          ip_hash?: string | null
          redirected_group_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      envio_message_feedback: {
        Row: {
          created_at: string
          envio_message_id: string
          feedback: string
          id: string
          note: string | null
        }
        Insert: {
          created_at?: string
          envio_message_id: string
          feedback: string
          id?: string
          note?: string | null
        }
        Update: {
          created_at?: string
          envio_message_id?: string
          feedback?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      envio_message_replies: {
        Row: {
          created_at: string
          envio_message_id: string | null
          group_id: string | null
          id: string
          participant_name: string | null
          participant_phone: string
          quoted_message_id: string
          replied_at: string
          reply_text: string | null
        }
        Insert: {
          created_at?: string
          envio_message_id?: string | null
          group_id?: string | null
          id?: string
          participant_name?: string | null
          participant_phone: string
          quoted_message_id: string
          replied_at?: string
          reply_text?: string | null
        }
        Update: {
          created_at?: string
          envio_message_id?: string | null
          group_id?: string | null
          id?: string
          participant_name?: string | null
          participant_phone?: string
          quoted_message_id?: string
          replied_at?: string
          reply_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_message_replies_envio_message_id_fkey"
            columns: ["envio_message_id"]
            isOneToOne: false
            referencedRelation: "envio_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_message_replies_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "envio_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_messages: {
        Row: {
          campaign_id: string | null
          content_text: string | null
          content_type: string
          created_at: string | null
          group_id: string | null
          id: string
          media_url: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          updated_at: string | null
          wa_message_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          content_text?: string | null
          content_type?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          media_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string | null
          wa_message_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          content_text?: string | null
          content_type?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          media_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string | null
          wa_message_id?: string | null
        }
        Relationships: []
      }
      envio_return_automations: {
        Row: {
          campaign_ids: string[]
          cooldown_hours: number
          coupon_code: string
          created_at: string
          delay_minutes: number
          group_ids: string[]
          id: string
          invite_message: string
          is_active: boolean
          name: string
          reward_message: string
          updated_at: string
          validity_days: number
        }
        Insert: {
          campaign_ids?: string[]
          cooldown_hours?: number
          coupon_code: string
          created_at?: string
          delay_minutes?: number
          group_ids?: string[]
          id?: string
          invite_message: string
          is_active?: boolean
          name: string
          reward_message: string
          updated_at?: string
          validity_days?: number
        }
        Update: {
          campaign_ids?: string[]
          cooldown_hours?: number
          coupon_code?: string
          created_at?: string
          delay_minutes?: number
          group_ids?: string[]
          id?: string
          invite_message?: string
          is_active?: boolean
          name?: string
          reward_message?: string
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      envio_return_pending: {
        Row: {
          automation_id: string
          created_at: string
          error_message: string | null
          expires_at: string
          group_id: string | null
          group_jid: string
          id: string
          invite_send_at: string
          invite_sent_at: string | null
          phone: string
          reward_sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          error_message?: string | null
          expires_at: string
          group_id?: string | null
          group_jid: string
          id?: string
          invite_send_at: string
          invite_sent_at?: string | null
          phone: string
          reward_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          error_message?: string | null
          expires_at?: string
          group_id?: string | null
          group_jid?: string
          id?: string
          invite_send_at?: string
          invite_sent_at?: string | null
          phone?: string
          reward_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "envio_return_pending_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "envio_return_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_return_pending_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "envio_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_automations: {
        Row: {
          canvas_data: Json
          created_at: string
          dispatch_count: number
          id: string
          keywords: string[]
          match_any_comment: boolean
          media_id: string | null
          media_thumbnail_url: string | null
          name: string
          status: Database["public"]["Enums"]["flow_automation_status"]
          trigger_kind: Database["public"]["Enums"]["flow_trigger_kind"]
          trigger_kinds: Database["public"]["Enums"]["flow_trigger_kind"][]
          updated_at: string
        }
        Insert: {
          canvas_data?: Json
          created_at?: string
          dispatch_count?: number
          id?: string
          keywords?: string[]
          match_any_comment?: boolean
          media_id?: string | null
          media_thumbnail_url?: string | null
          name?: string
          status?: Database["public"]["Enums"]["flow_automation_status"]
          trigger_kind?: Database["public"]["Enums"]["flow_trigger_kind"]
          trigger_kinds?: Database["public"]["Enums"]["flow_trigger_kind"][]
          updated_at?: string
        }
        Update: {
          canvas_data?: Json
          created_at?: string
          dispatch_count?: number
          id?: string
          keywords?: string[]
          match_any_comment?: boolean
          media_id?: string | null
          media_thumbnail_url?: string | null
          name?: string
          status?: Database["public"]["Enums"]["flow_automation_status"]
          trigger_kind?: Database["public"]["Enums"]["flow_trigger_kind"]
          trigger_kinds?: Database["public"]["Enums"]["flow_trigger_kind"][]
          updated_at?: string
        }
        Relationships: []
      }
      flow_contacts: {
        Row: {
          first_seen_at: string
          id: string
          ig_user_id: string
          last_seen_at: string
          tags: string[]
          username: string | null
        }
        Insert: {
          first_seen_at?: string
          id?: string
          ig_user_id: string
          last_seen_at?: string
          tags?: string[]
          username?: string | null
        }
        Update: {
          first_seen_at?: string
          id?: string
          ig_user_id?: string
          last_seen_at?: string
          tags?: string[]
          username?: string | null
        }
        Relationships: []
      }
      flow_dispatch_dedup: {
        Row: {
          automation_id: string
          dispatched_at: string
          ig_user_id: string
        }
        Insert: {
          automation_id: string
          dispatched_at?: string
          ig_user_id: string
        }
        Update: {
          automation_id?: string
          dispatched_at?: string
          ig_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_dispatch_dedup_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "flow_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_dispatch_logs: {
        Row: {
          automation_id: string | null
          comment_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_user_id: string | null
          ig_username: string | null
          matched_keyword: string | null
          node_id: string | null
          status: Database["public"]["Enums"]["flow_dispatch_status"]
        }
        Insert: {
          automation_id?: string | null
          comment_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          matched_keyword?: string | null
          node_id?: string | null
          status: Database["public"]["Enums"]["flow_dispatch_status"]
        }
        Update: {
          automation_id?: string | null
          comment_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          matched_keyword?: string | null
          node_id?: string | null
          status?: Database["public"]["Enums"]["flow_dispatch_status"]
        }
        Relationships: [
          {
            foreignKeyName: "flow_dispatch_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "flow_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_node_stats: {
        Row: {
          automation_id: string
          clicked_count: number | null
          delivered_count: number | null
          id: string
          node_id: string
          opened_count: number | null
          sent_count: number | null
          updated_at: string | null
        }
        Insert: {
          automation_id: string
          clicked_count?: number | null
          delivered_count?: number | null
          id?: string
          node_id: string
          opened_count?: number | null
          sent_count?: number | null
          updated_at?: string | null
        }
        Update: {
          automation_id?: string
          clicked_count?: number | null
          delivered_count?: number | null
          id?: string
          node_id?: string
          opened_count?: number | null
          sent_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_node_stats_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "flow_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_webhook_events: {
        Row: {
          id: string
          processed: boolean
          processing_error: string | null
          raw_payload: Json
          received_at: string
          signature_valid: boolean
        }
        Insert: {
          id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload: Json
          received_at?: string
          signature_valid: boolean
        }
        Update: {
          id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload?: Json
          received_at?: string
          signature_valid?: boolean
        }
        Relationships: []
      }
      meta_ads_planning: {
        Row: {
          cps: number
          id: string
          investimento_mensal: number
          meta_receita: number | null
          taxa_conversao: number
          ticket_medio: number
          updated_at: string
        }
        Insert: {
          cps: number
          id?: string
          investimento_mensal: number
          meta_receita?: number | null
          taxa_conversao: number
          ticket_medio: number
          updated_at?: string
        }
        Update: {
          cps?: number
          id?: string
          investimento_mensal?: number
          meta_receita?: number | null
          taxa_conversao?: number
          ticket_medio?: number
          updated_at?: string
        }
        Relationships: []
      }
      meta_ads_rules: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          metric: string
          operator: string
          value: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          metric: string
          operator: string
          value: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          metric?: string
          operator?: string
          value?: number
        }
        Relationships: []
      }
      popup_campaigns: {
        Row: {
          body_text: string
          button_text: string
          collect_name: boolean
          coupon_mode: string
          created_at: string
          design_config: Json
          discount_expires_days: number | null
          discount_type: string | null
          discount_value: number | null
          fixed_coupon_code: string | null
          headline: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          reshow_after_days: number | null
          reshow_mode: string
          template_id: string | null
          template_language: string | null
          template_name: string | null
          template_var_mapping: Json
          trigger_exit_intent: boolean
          trigger_time_seconds: number | null
          updated_at: string
        }
        Insert: {
          body_text?: string
          button_text?: string
          collect_name?: boolean
          coupon_mode?: string
          created_at?: string
          design_config?: Json
          discount_expires_days?: number | null
          discount_type?: string | null
          discount_value?: number | null
          fixed_coupon_code?: string | null
          headline?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          reshow_after_days?: number | null
          reshow_mode?: string
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          template_var_mapping?: Json
          trigger_exit_intent?: boolean
          trigger_time_seconds?: number | null
          updated_at?: string
        }
        Update: {
          body_text?: string
          button_text?: string
          collect_name?: boolean
          coupon_mode?: string
          created_at?: string
          design_config?: Json
          discount_expires_days?: number | null
          discount_type?: string | null
          discount_value?: number | null
          fixed_coupon_code?: string | null
          headline?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          reshow_after_days?: number | null
          reshow_mode?: string
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          template_var_mapping?: Json
          trigger_exit_intent?: boolean
          trigger_time_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      popup_leads: {
        Row: {
          coupon_code: string | null
          created_at: string
          customer_row_id: string | null
          first_captured_at: string
          id: string
          last_captured_at: string
          last_visit_at: string | null
          name: string | null
          phone: string
          popup_campaign_id: string | null
          updated_at: string
          visitor_token: string | null
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          customer_row_id?: string | null
          first_captured_at?: string
          id?: string
          last_captured_at?: string
          last_visit_at?: string | null
          name?: string | null
          phone: string
          popup_campaign_id?: string | null
          updated_at?: string
          visitor_token?: string | null
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          customer_row_id?: string | null
          first_captured_at?: string
          id?: string
          last_captured_at?: string
          last_visit_at?: string | null
          name?: string | null
          phone?: string
          popup_campaign_id?: string | null
          updated_at?: string
          visitor_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "popup_leads_popup_campaign_id_fkey"
            columns: ["popup_campaign_id"]
            isOneToOne: false
            referencedRelation: "popup_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      popup_social_proof_settings: {
        Row: {
          delay_after_capture_seconds: number
          enabled: boolean
          id: number
          interval_seconds: number
          position: string
          updated_at: string
          visible_seconds: number
        }
        Insert: {
          delay_after_capture_seconds?: number
          enabled?: boolean
          id?: number
          interval_seconds?: number
          position?: string
          updated_at?: string
          visible_seconds?: number
        }
        Update: {
          delay_after_capture_seconds?: number
          enabled?: boolean
          id?: number
          interval_seconds?: number
          position?: string
          updated_at?: string
          visible_seconds?: number
        }
        Relationships: []
      }
      shopify_abandoned_checkouts: {
        Row: {
          checkout_url: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          phone: string | null
          raw_data: Json | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          checkout_url?: string | null
          created_at: string
          customer_id?: string | null
          email?: string | null
          id: string
          phone?: string | null
          raw_data?: Json | null
          total_price?: number | null
          updated_at: string
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          raw_data?: Json | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_abandoned_checkouts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shopify_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_customers: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          province: string | null
          rfm_segment: string | null
          tags: string[] | null
          tags_custom: string[] | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          rfm_segment?: string | null
          tags?: string[] | null
          tags_custom?: string[] | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          rfm_segment?: string | null
          tags?: string[] | null
          tags_custom?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      shopify_fulfillments: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          raw_data: Json | null
          status: string | null
          tracking_company: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          order_id?: string | null
          raw_data?: Json | null
          status?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          raw_data?: Json | null
          status?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shopify_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_order_items: {
        Row: {
          id: string
          order_id: string | null
          price: number | null
          product_id: string | null
          quantity: number | null
          sku: string | null
          title: string | null
          total_discount: number | null
          variant_id: string | null
          variant_title: string | null
        }
        Insert: {
          id: string
          order_id?: string | null
          price?: number | null
          product_id?: string | null
          quantity?: number | null
          sku?: string | null
          title?: string | null
          total_discount?: number | null
          variant_id?: string | null
          variant_title?: string | null
        }
        Update: {
          id?: string
          order_id?: string | null
          price?: number | null
          product_id?: string | null
          quantity?: number | null
          sku?: string | null
          title?: string | null
          total_discount?: number | null
          variant_id?: string | null
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shopify_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_orders: {
        Row: {
          cancelled_at: string | null
          city: string | null
          country: string | null
          created_at: string
          currency_code: string | null
          customer_id: string | null
          email: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          landing_site: string | null
          order_number: string
          phone: string | null
          processed_at: string | null
          province: string | null
          raw_data: Json | null
          referring_site: string | null
          source_name: string | null
          subtotal_price: number | null
          total_discounts: number | null
          total_price: number
          total_shipping_price: number | null
          total_tax: number | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          city?: string | null
          country?: string | null
          created_at: string
          currency_code?: string | null
          customer_id?: string | null
          email?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id: string
          landing_site?: string | null
          order_number: string
          phone?: string | null
          processed_at?: string | null
          province?: string | null
          raw_data?: Json | null
          referring_site?: string | null
          source_name?: string | null
          subtotal_price?: number | null
          total_discounts?: number | null
          total_price: number
          total_shipping_price?: number | null
          total_tax?: number | null
          updated_at: string
        }
        Update: {
          cancelled_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string | null
          customer_id?: string | null
          email?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          landing_site?: string | null
          order_number?: string
          phone?: string | null
          processed_at?: string | null
          province?: string | null
          raw_data?: Json | null
          referring_site?: string | null
          source_name?: string | null
          subtotal_price?: number | null
          total_discounts?: number | null
          total_price?: number
          total_shipping_price?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shopify_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          created_at: string
          id: string
          page_url: string | null
          visitor_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_url?: string | null
          visitor_token: string
        }
        Update: {
          created_at?: string
          id?: string
          page_url?: string | null
          visitor_token?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          ai_marketing_playbook: string | null
          ai_marketing_playbook_updated_at: string | null
          automation_tick_secret: string | null
          created_at: string
          events_latest_analysis: Json | null
          events_latest_analysis_at: string | null
          events_latest_analysis_range: Json | null
          id: string
          instagram_business_account_id: string | null
          instagram_connected_at: string | null
          instagram_latest_analysis: Json | null
          instagram_latest_analysis_at: string | null
          instagram_latest_analysis_period: string | null
          instagram_messaging_access_token: string | null
          instagram_messaging_account_id: string | null
          instagram_page_access_token: string | null
          instagram_username: string | null
          last_imported_order_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          latest_ai_analysis: Json | null
          latest_ai_analysis_at: string | null
          latest_ai_analysis_period: string | null
          live_launchpad_supabase_service_role_key: string | null
          live_launchpad_supabase_url: string | null
          meta_ads_access_token: string | null
          meta_ads_account_id: string | null
          meta_ads_connected_at: string | null
          meta_ads_latest_analysis: Json | null
          meta_ads_latest_analysis_at: string | null
          meta_ads_latest_analysis_period: string | null
          openai_api_key: string | null
          shopify_admin_access_token: string | null
          shopify_client_id: string | null
          shopify_client_secret: string | null
          shopify_store_domain: string
          storefront_domain: string | null
          sync_status: string | null
          total_orders_imported: number | null
          uazapi_admin_token: string | null
          uazapi_connected_phone: string | null
          uazapi_is_active: boolean
          uazapi_token: string | null
          uazapi_url: string | null
          updated_at: string
          user_id: string | null
          whatsapp_cost_marketing: number | null
          whatsapp_cost_utility: number | null
          whatsapp_meta_access_token: string | null
          whatsapp_meta_app_id: string | null
          whatsapp_meta_app_secret: string | null
          whatsapp_meta_config_id: string | null
          whatsapp_meta_phone_number_id: string | null
          whatsapp_meta_template_language: string | null
          whatsapp_meta_template_name: string | null
          whatsapp_meta_verify_token: string | null
          whatsapp_meta_waba_id: string | null
        }
        Insert: {
          ai_marketing_playbook?: string | null
          ai_marketing_playbook_updated_at?: string | null
          automation_tick_secret?: string | null
          created_at?: string
          events_latest_analysis?: Json | null
          events_latest_analysis_at?: string | null
          events_latest_analysis_range?: Json | null
          id?: string
          instagram_business_account_id?: string | null
          instagram_connected_at?: string | null
          instagram_latest_analysis?: Json | null
          instagram_latest_analysis_at?: string | null
          instagram_latest_analysis_period?: string | null
          instagram_messaging_access_token?: string | null
          instagram_messaging_account_id?: string | null
          instagram_page_access_token?: string | null
          instagram_username?: string | null
          last_imported_order_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          latest_ai_analysis?: Json | null
          latest_ai_analysis_at?: string | null
          latest_ai_analysis_period?: string | null
          live_launchpad_supabase_service_role_key?: string | null
          live_launchpad_supabase_url?: string | null
          meta_ads_access_token?: string | null
          meta_ads_account_id?: string | null
          meta_ads_connected_at?: string | null
          meta_ads_latest_analysis?: Json | null
          meta_ads_latest_analysis_at?: string | null
          meta_ads_latest_analysis_period?: string | null
          openai_api_key?: string | null
          shopify_admin_access_token?: string | null
          shopify_client_id?: string | null
          shopify_client_secret?: string | null
          shopify_store_domain: string
          storefront_domain?: string | null
          sync_status?: string | null
          total_orders_imported?: number | null
          uazapi_admin_token?: string | null
          uazapi_connected_phone?: string | null
          uazapi_is_active?: boolean
          uazapi_token?: string | null
          uazapi_url?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_cost_marketing?: number | null
          whatsapp_cost_utility?: number | null
          whatsapp_meta_access_token?: string | null
          whatsapp_meta_app_id?: string | null
          whatsapp_meta_app_secret?: string | null
          whatsapp_meta_config_id?: string | null
          whatsapp_meta_phone_number_id?: string | null
          whatsapp_meta_template_language?: string | null
          whatsapp_meta_template_name?: string | null
          whatsapp_meta_verify_token?: string | null
          whatsapp_meta_waba_id?: string | null
        }
        Update: {
          ai_marketing_playbook?: string | null
          ai_marketing_playbook_updated_at?: string | null
          automation_tick_secret?: string | null
          created_at?: string
          events_latest_analysis?: Json | null
          events_latest_analysis_at?: string | null
          events_latest_analysis_range?: Json | null
          id?: string
          instagram_business_account_id?: string | null
          instagram_connected_at?: string | null
          instagram_latest_analysis?: Json | null
          instagram_latest_analysis_at?: string | null
          instagram_latest_analysis_period?: string | null
          instagram_messaging_access_token?: string | null
          instagram_messaging_account_id?: string | null
          instagram_page_access_token?: string | null
          instagram_username?: string | null
          last_imported_order_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          latest_ai_analysis?: Json | null
          latest_ai_analysis_at?: string | null
          latest_ai_analysis_period?: string | null
          live_launchpad_supabase_service_role_key?: string | null
          live_launchpad_supabase_url?: string | null
          meta_ads_access_token?: string | null
          meta_ads_account_id?: string | null
          meta_ads_connected_at?: string | null
          meta_ads_latest_analysis?: Json | null
          meta_ads_latest_analysis_at?: string | null
          meta_ads_latest_analysis_period?: string | null
          openai_api_key?: string | null
          shopify_admin_access_token?: string | null
          shopify_client_id?: string | null
          shopify_client_secret?: string | null
          shopify_store_domain?: string
          storefront_domain?: string | null
          sync_status?: string | null
          total_orders_imported?: number | null
          uazapi_admin_token?: string | null
          uazapi_connected_phone?: string | null
          uazapi_is_active?: boolean
          uazapi_token?: string | null
          uazapi_url?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_cost_marketing?: number | null
          whatsapp_cost_utility?: number | null
          whatsapp_meta_access_token?: string | null
          whatsapp_meta_app_id?: string | null
          whatsapp_meta_app_secret?: string | null
          whatsapp_meta_config_id?: string | null
          whatsapp_meta_phone_number_id?: string | null
          whatsapp_meta_template_language?: string | null
          whatsapp_meta_template_name?: string | null
          whatsapp_meta_verify_token?: string | null
          whatsapp_meta_waba_id?: string | null
        }
        Relationships: []
      }
      whatsapp_automation_runs: {
        Row: {
          automation_id: string
          campaign_id: string | null
          completed_at: string | null
          context_key: string | null
          created_at: string
          current_step_id: string
          customer_id: string
          enrolled_at: string
          enrollment_key: string
          event_context: Json
          id: string
          last_error: string | null
          next_run_at: string | null
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          automation_id: string
          campaign_id?: string | null
          completed_at?: string | null
          context_key?: string | null
          created_at?: string
          current_step_id: string
          customer_id: string
          enrolled_at?: string
          enrollment_key?: string
          event_context?: Json
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          automation_id?: string
          campaign_id?: string | null
          completed_at?: string | null
          context_key?: string | null
          created_at?: string
          current_step_id?: string
          customer_id?: string
          enrolled_at?: string
          enrollment_key?: string
          event_context?: Json
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_runs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shopify_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_automations: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          last_run_at: string | null
          nome: string
          origem: string
          reentry_after_days: number | null
          reentry_mode: string
          requer_aprovacao: boolean
          segment_id: string | null
          segment_type: string
          steps: Json
          total_execucoes: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          last_run_at?: string | null
          nome: string
          origem?: string
          reentry_after_days?: number | null
          reentry_mode?: string
          requer_aprovacao?: boolean
          segment_id?: string | null
          segment_type: string
          steps?: Json
          total_execucoes?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          last_run_at?: string | null
          nome?: string
          origem?: string
          reentry_after_days?: number | null
          reentry_mode?: string
          requer_aprovacao?: boolean
          segment_id?: string | null
          segment_type?: string
          steps?: Json
          total_execucoes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automations_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaign_recipients: {
        Row: {
          campaign_id: string
          customer_id: string | null
          delivered_at: string | null
          error: string | null
          id: string
          phone: string
          read_at: string | null
          sent_at: string | null
          status: string
          wa_message_id: string | null
        }
        Insert: {
          campaign_id: string
          customer_id?: string | null
          delivered_at?: string | null
          error?: string | null
          id?: string
          phone: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          campaign_id?: string
          customer_id?: string | null
          delivered_at?: string | null
          error?: string | null
          id?: string
          phone?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          automation_id: string | null
          automation_step_id: string | null
          body_param_tokens: Json | null
          body_params: Json
          campaign_tag: string | null
          coupon_code: string | null
          created_at: string
          enviadas: number
          falhas: number
          id: string
          message_type: string
          nome: string
          origem: string
          reject_reason: string | null
          rejected_at: string | null
          segment_id: string | null
          segment_type: string
          sent_at: string | null
          status: string
          template_language: string
          template_name: string
          total_destinatarios: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          automation_id?: string | null
          automation_step_id?: string | null
          body_param_tokens?: Json | null
          body_params?: Json
          campaign_tag?: string | null
          coupon_code?: string | null
          created_at?: string
          enviadas?: number
          falhas?: number
          id?: string
          message_type?: string
          nome: string
          origem?: string
          reject_reason?: string | null
          rejected_at?: string | null
          segment_id?: string | null
          segment_type: string
          sent_at?: string | null
          status?: string
          template_language?: string
          template_name: string
          total_destinatarios?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          automation_id?: string | null
          automation_step_id?: string | null
          body_param_tokens?: Json | null
          body_params?: Json
          campaign_tag?: string | null
          coupon_code?: string | null
          created_at?: string
          enviadas?: number
          falhas?: number
          id?: string
          message_type?: string
          nome?: string
          origem?: string
          reject_reason?: string | null
          rejected_at?: string | null
          segment_id?: string | null
          segment_type?: string
          sent_at?: string | null
          status?: string
          template_language?: string
          template_name?: string
          total_destinatarios?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversation_runs: {
        Row: {
          completed_at: string | null
          current_step_id: string
          customer_id: string | null
          flow_id: string
          id: string
          last_error: string | null
          next_run_at: string | null
          phone: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          current_step_id: string
          customer_id?: string | null
          flow_id: string
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          phone: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          current_step_id?: string
          customer_id?: string | null
          flow_id?: string
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          phone?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversational_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversational_flows: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          last_run_at: string | null
          nome: string
          steps: Json
          total_execucoes: number
          trigger_template_name: string | null
          trigger_type: string
          trigger_values: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          last_run_at?: string | null
          nome: string
          steps?: Json
          total_execucoes?: number
          trigger_template_name?: string | null
          trigger_type: string
          trigger_values?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          last_run_at?: string | null
          nome?: string
          steps?: Json
          total_execucoes?: number
          trigger_template_name?: string | null
          trigger_type?: string
          trigger_values?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_inbox_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          media_url: string | null
          message_type: string
          sent_at: string
          status: string | null
          thread_id: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          sent_at?: string
          status?: string | null
          thread_id: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          sent_at?: string
          status?: string | null
          thread_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbox_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbox_threads: {
        Row: {
          contact_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string
          last_message_preview: string | null
          phone: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          phone: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          phone?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_message_queue: {
        Row: {
          attempts: number
          body_param_tokens: Json | null
          body_params: Json
          campaign_id: string | null
          created_at: string
          customer_id: string | null
          dedup_key: string | null
          error: string | null
          header_media_url: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          origem: string
          phone: string
          priority: number
          scheduled_at: string
          sent_at: string | null
          status: string
          template_language: string
          template_name: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          attempts?: number
          body_param_tokens?: Json | null
          body_params?: Json
          campaign_id?: string | null
          created_at?: string
          customer_id?: string | null
          dedup_key?: string | null
          error?: string | null
          header_media_url?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          origem?: string
          phone: string
          priority?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_language?: string
          template_name: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          attempts?: number
          body_param_tokens?: Json | null
          body_params?: Json
          campaign_id?: string | null
          created_at?: string
          customer_id?: string | null
          dedup_key?: string | null
          error?: string | null
          header_media_url?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          origem?: string
          phone?: string
          priority?: number
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_language?: string
          template_name?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "shopify_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_events: {
        Row: {
          category: string | null
          event: string
          id: string
          reason: string | null
          received_at: string
          template_id: string | null
          template_language: string | null
          template_name: string
        }
        Insert: {
          category?: string | null
          event: string
          id?: string
          reason?: string | null
          received_at?: string
          template_id?: string | null
          template_language?: string | null
          template_name: string
        }
        Update: {
          category?: string | null
          event?: string
          id?: string
          reason?: string | null
          received_at?: string
          template_id?: string | null
          template_language?: string | null
          template_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_whatsapp_message_queue: {
        Args: { p_limit: number; p_worker: string }
        Returns: {
          attempts: number
          body_param_tokens: Json | null
          body_params: Json
          campaign_id: string | null
          created_at: string
          customer_id: string | null
          dedup_key: string | null
          error: string | null
          header_media_url: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          origem: string
          phone: string
          priority: number
          scheduled_at: string
          sent_at: string | null
          status: string
          template_language: string
          template_name: string
          updated_at: string
          wa_message_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_message_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      requeue_stale_whatsapp_queue: {
        Args: { p_stale_minutes?: number }
        Returns: number
      }
    }
    Enums: {
      flow_automation_status: "draft" | "active" | "paused"
      flow_dispatch_status: "success" | "error" | "skipped"
      flow_trigger_kind:
        | "post_or_reel_comment"
        | "story_reply"
        | "live_comment"
        | "dm_message"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      flow_automation_status: ["draft", "active", "paused"],
      flow_dispatch_status: ["success", "error", "skipped"],
      flow_trigger_kind: [
        "post_or_reel_comment",
        "story_reply",
        "live_comment",
        "dm_message",
      ],
    },
  },
} as const
