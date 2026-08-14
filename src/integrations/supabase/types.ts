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
          created_at: string
          id: string
          last_imported_order_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          latest_ai_analysis: Json | null
          latest_ai_analysis_at: string | null
          latest_ai_analysis_period: string | null
          openai_api_key: string | null
          shopify_admin_access_token: string | null
          shopify_client_id: string | null
          shopify_client_secret: string | null
          shopify_store_domain: string
          sync_status: string | null
          total_orders_imported: number | null
          updated_at: string
          user_id: string | null
          whatsapp_meta_access_token: string | null
          whatsapp_meta_phone_number_id: string | null
          whatsapp_meta_template_name: string | null
          whatsapp_meta_template_language: string | null
          whatsapp_meta_waba_id: string | null
          whatsapp_meta_verify_token: string | null
          whatsapp_cost_marketing: number | null
          whatsapp_cost_utility: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_imported_order_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          latest_ai_analysis?: Json | null
          latest_ai_analysis_at?: string | null
          latest_ai_analysis_period?: string | null
          openai_api_key?: string | null
          shopify_admin_access_token?: string | null
          shopify_client_id?: string | null
          shopify_client_secret?: string | null
          shopify_store_domain: string
          sync_status?: string | null
          total_orders_imported?: number | null
          updated_at?: string
          user_id?: string | null
          whatsapp_meta_access_token?: string | null
          whatsapp_meta_phone_number_id?: string | null
          whatsapp_meta_template_name?: string | null
          whatsapp_meta_template_language?: string | null
          whatsapp_meta_waba_id?: string | null
          whatsapp_meta_verify_token?: string | null
          whatsapp_cost_marketing?: number | null
          whatsapp_cost_utility?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          last_imported_order_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          latest_ai_analysis?: Json | null
          latest_ai_analysis_at?: string | null
          latest_ai_analysis_period?: string | null
          openai_api_key?: string | null
          shopify_admin_access_token?: string | null
          shopify_client_id?: string | null
          shopify_client_secret?: string | null
          shopify_store_domain?: string
          sync_status?: string | null
          total_orders_imported?: number | null
          updated_at?: string
          user_id?: string | null
          whatsapp_meta_access_token?: string | null
          whatsapp_meta_phone_number_id?: string | null
          whatsapp_meta_template_name?: string | null
          whatsapp_meta_template_language?: string | null
          whatsapp_meta_waba_id?: string | null
          whatsapp_meta_verify_token?: string | null
          whatsapp_cost_marketing?: number | null
          whatsapp_cost_utility?: number | null
        }
        Relationships: []
      }
      whatsapp_campaigns: {
        Row: {
          id: string
          nome: string
          status: string
          segment_type: string
          template_name: string
          message_type: string
          coupon_code: string | null
          enviadas: number
          falhas: number
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          nome: string
          status?: string
          segment_type: string
          template_name: string
          message_type?: string
          coupon_code?: string | null
          enviadas?: number
          falhas?: number
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          nome?: string
          status?: string
          segment_type?: string
          template_name?: string
          message_type?: string
          coupon_code?: string | null
          enviadas?: number
          falhas?: number
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      whatsapp_campaign_recipients: {
        Row: {
          id: string
          campaign_id: string
          customer_id: string | null
          phone: string
          wa_message_id: string | null
          status: string
          sent_at: string | null
          delivered_at: string | null
          read_at: string | null
          error: string | null
        }
        Insert: {
          id?: string
          campaign_id: string
          customer_id?: string | null
          phone: string
          wa_message_id?: string | null
          status?: string
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          error?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string
          customer_id?: string | null
          phone?: string
          wa_message_id?: string | null
          status?: string
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          error?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
