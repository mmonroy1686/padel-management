
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "bookings": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"ends_at": string | null,"guest_name": string | null,"id": string,"occupancy_id": string | null,"period": unknown,"player_id": string | null,"price": number,"series_id": string | null,"source": Database["public"]['Enums']["booking_source"],"starts_at": string | null,"status": Database["public"]['Enums']["booking_status"]
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"guest_name"?: string | null,"id"?: string,"occupancy_id"?: string | null,"period": unknown,"player_id"?: string | null,"price": number,"series_id"?: string | null,"source": Database["public"]['Enums']["booking_source"],"starts_at"?: never,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"guest_name"?: string | null,"id"?: string,"occupancy_id"?: string | null,"period"?: unknown,"player_id"?: string | null,"price"?: number,"series_id"?: string | null,"source"?: Database["public"]['Enums']["booking_source"],"starts_at"?: never,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "bookings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_occupancy_id_fkey"
      columns: ["occupancy_id"]
isOneToOne: true
      referencedRelation: "court_occupancy"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "recurring_series"
      referencedColumns: ["id"]
    }
                  ]
                },"club_members": {
                  Row: {
                    "category": number | null,"category_validated": boolean,"club_id": string,"created_at": string,"role": Database["public"]['Enums']["club_role"],"user_id": string
                  }
                  Insert: {
                    "category"?: number | null,"category_validated"?: boolean,"club_id": string,"created_at"?: string,"role"?: Database["public"]['Enums']["club_role"],"user_id": string
                  }
                  Update: {
                    "category"?: number | null,"category_validated"?: boolean,"club_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["club_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "club_members_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "club_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clubs": {
                  Row: {
                    "accepts_cash": boolean,"accepts_transfer": boolean,"booking_window_days": number,"cancellation_notice_hours": number,"closes_at": string,"created_at": string,"id": string,"max_active_bookings": number,"name": string,"opens_at": string,"slot_minutes": number,"slug": string,"timezone": string,"transfer_details": string | null,"transfer_receipt_required": boolean
                  }
                  Insert: {
                    "accepts_cash"?: boolean,"accepts_transfer"?: boolean,"booking_window_days"?: number,"cancellation_notice_hours"?: number,"closes_at"?: string,"created_at"?: string,"id"?: string,"max_active_bookings"?: number,"name": string,"opens_at"?: string,"slot_minutes"?: number,"slug": string,"timezone"?: string,"transfer_details"?: string | null,"transfer_receipt_required"?: boolean
                  }
                  Update: {
                    "accepts_cash"?: boolean,"accepts_transfer"?: boolean,"booking_window_days"?: number,"cancellation_notice_hours"?: number,"closes_at"?: string,"created_at"?: string,"id"?: string,"max_active_bookings"?: number,"name"?: string,"opens_at"?: string,"slot_minutes"?: number,"slug"?: string,"timezone"?: string,"transfer_details"?: string | null,"transfer_receipt_required"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"court_occupancy": {
                  Row: {
                    "club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"ends_at": string | null,"id": string,"kind": Database["public"]['Enums']["occupancy_kind"],"note": string | null,"period": unknown,"starts_at": string | null
                  }
                  Insert: {
                    "club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"kind": Database["public"]['Enums']["occupancy_kind"],"note"?: string | null,"period": unknown,"starts_at"?: never
                  }
                  Update: {
                    "club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"kind"?: Database["public"]['Enums']["occupancy_kind"],"note"?: string | null,"period"?: unknown,"starts_at"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "court_occupancy_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "court_occupancy_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "court_occupancy_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"courts": {
                  Row: {
                    "club_id": string,"created_at": string,"id": string,"is_active": boolean,"is_covered": boolean,"name": string,"sort_order": number
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_covered"?: boolean,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_covered"?: boolean,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "courts_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"booking_id": string,"club_id": string,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"receipt_path": string | null,"rejection_reason": string | null,"reported_by": string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Insert: {
                    "amount": number,"booking_id": string,"club_id": string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"receipt_path"?: string | null,"rejection_reason"?: string | null,"reported_by"?: string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string,"club_id"?: string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"receipt_path"?: string | null,"rejection_reason"?: string | null,"reported_by"?: string | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_in_club"
      columns: ["booking_id","club_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "payments_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pricing_rules": {
                  Row: {
                    "club_id": string,"created_at": string,"from_time": string,"id": string,"price": number,"to_time": string,"weekdays": (number)[]
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"from_time": string,"id"?: string,"price": number,"to_time": string,"weekdays": (number)[]
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"from_time"?: string,"id"?: string,"price"?: number,"to_time"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_rules_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"hand": Database["public"]['Enums']["dominant_hand"] | null,"id": string,"is_public": boolean,"side": Database["public"]['Enums']["player_side"] | null
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"hand"?: Database["public"]['Enums']["dominant_hand"] | null,"id": string,"is_public"?: boolean,"side"?: Database["public"]['Enums']["player_side"] | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"hand"?: Database["public"]['Enums']["dominant_hand"] | null,"id"?: string,"is_public"?: boolean,"side"?: Database["public"]['Enums']["player_side"] | null
                  }
                  Relationships: [
                    
                  ]
                },"recurring_series": {
                  Row: {
                    "club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"ends_on": string | null,"generated_until": string | null,"guest_name": string | null,"id": string,"player_id": string | null,"start_time": string,"starts_on": string,"weekday": number
                  }
                  Insert: {
                    "club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"generated_until"?: string | null,"guest_name"?: string | null,"id"?: string,"player_id"?: string | null,"start_time": string,"starts_on": string,"weekday": number
                  }
                  Update: {
                    "club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"generated_until"?: string | null,"guest_name"?: string | null,"id"?: string,"player_id"?: string | null,"start_time"?: string,"starts_on"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_series_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "recurring_series_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recurring_series_skips": {
                  Row: {
                    "club_id": string,"created_at": string,"id": string,"on_date": string,"reason": string,"series_id": string
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"id"?: string,"on_date": string,"reason": string,"series_id": string
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"id"?: string,"on_date"?: string,"reason"?: string,"series_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_series_skips_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_skips_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "recurring_series"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "block_court":
{ Args: { "p_court_id": string,"p_ends_at": string,"p_note"?: string,"p_starts_at": string }; Returns: {
              "club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"kind": Database["public"]['Enums']["occupancy_kind"],
"note": string | null,
"period": unknown,
"starts_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "court_occupancy"
        isOneToOne: true
        isSetofReturn: false
      } },
"book_slot":
{ Args: { "p_court_id": string,"p_starts_at": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_booking":
{ Args: { "p_booking_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_my_booking":
{ Args: { "p_booking_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"staff_book":
{ Args: { "p_court_id": string,"p_guest_name"?: string,"p_player_id"?: string,"p_starts_at": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"unblock":
{ Args: { "p_occupancy_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "booking_source": "online"|"reception","booking_status": "confirmed"|"cancelled","club_role": "admin"|"reception"|"player","dominant_hand": "right"|"left","occupancy_kind": "booking"|"recurring"|"tournament"|"block"|"match"|"day_use","payment_method": "cash"|"transfer","payment_status": "reported"|"confirmed"|"rejected"|"refunded","player_side": "drive"|"backhand"|"both"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "booking_source": ["online", "reception"],"booking_status": ["confirmed", "cancelled"],"club_role": ["admin", "reception", "player"],"dominant_hand": ["right", "left"],"occupancy_kind": ["booking", "recurring", "tournament", "block", "match", "day_use"],"payment_method": ["cash", "transfer"],"payment_status": ["reported", "confirmed", "rejected", "refunded"],"player_side": ["drive", "backhand", "both"]
          }
        }
} as const

