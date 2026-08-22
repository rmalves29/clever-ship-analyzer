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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
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
      store_settings: {
        Row: {
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
          instagram_page_access_token: string | null
          instagram_username: string | null
          last_imported_order_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          latest_ai_analysis: Json | null
          latest_ai_analysis_at: string | null
          latest_ai_analysis_period: string | null
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
          sync_status: string | null
          total_orders_imported: number | null
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
          instagram_page_access_token?: string | null
          instagram_username?: string | null
          last_imported_order_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          latest_ai_analysis?: Json | null
          latest_ai_analysis_at?: string | null
          latest_ai_analysis_period?: string | null
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
          sync_status?: string | null
          total_orders_imported?: number | null
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
          instagram_page_access_token?: string | null
          instagram_username?: string | null
          last_imported_order_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          latest_ai_analysis?: Json | null
          latest_ai_analysis_at?: string | null
          latest_ai_analysis_period?: string | null
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
          sync_status?: string | null
          total_orders_imported?: number | null
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
          created_at: string
          current_step_id: string
          customer_id: string
          enrolled_at: string
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
          created_at?: string
          current_step_id: string
          customer_id: string
          enrolled_at?: string
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
          created_at?: string
          current_step_id?: string
          customer_id?: string
          enrolled_at?: string
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
      [_ in never]: never
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
