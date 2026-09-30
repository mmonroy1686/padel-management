
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "bookings": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"ends_at": string | null,"guest_name": string | null,"id": string,"match_id": string | null,"occupancy_id": string | null,"period": unknown,"player_id": string | null,"price": number,"series_id": string | null,"source": Database["public"]['Enums']["booking_source"],"starts_at": string | null,"status": Database["public"]['Enums']["booking_status"]
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"guest_name"?: string | null,"id"?: string,"match_id"?: string | null,"occupancy_id"?: string | null,"period": unknown,"player_id"?: string | null,"price": number,"series_id"?: string | null,"source": Database["public"]['Enums']["booking_source"],"starts_at"?: never,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"guest_name"?: string | null,"id"?: string,"match_id"?: string | null,"occupancy_id"?: string | null,"period"?: unknown,"player_id"?: string | null,"price"?: number,"series_id"?: string | null,"source"?: Database["public"]['Enums']["booking_source"],"starts_at"?: never,"status"?: Database["public"]['Enums']["booking_status"]
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
      foreignKeyName: "bookings_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "open_matches"
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
                    "accepts_cash": boolean,"accepts_transfer": boolean,"booking_window_days": number,"cancellation_notice_hours": number,"closes_at": string,"created_at": string,"id": string,"match_close_hours": number,"max_active_bookings": number,"name": string,"opens_at": string,"slot_minutes": number,"slug": string,"timezone": string,"transfer_details": string | null,"transfer_receipt_required": boolean
                  }
                  Insert: {
                    "accepts_cash"?: boolean,"accepts_transfer"?: boolean,"booking_window_days"?: number,"cancellation_notice_hours"?: number,"closes_at"?: string,"created_at"?: string,"id"?: string,"match_close_hours"?: number,"max_active_bookings"?: number,"name": string,"opens_at"?: string,"slot_minutes"?: number,"slug": string,"timezone"?: string,"transfer_details"?: string | null,"transfer_receipt_required"?: boolean
                  }
                  Update: {
                    "accepts_cash"?: boolean,"accepts_transfer"?: boolean,"booking_window_days"?: number,"cancellation_notice_hours"?: number,"closes_at"?: string,"created_at"?: string,"id"?: string,"match_close_hours"?: number,"max_active_bookings"?: number,"name"?: string,"opens_at"?: string,"slot_minutes"?: number,"slug"?: string,"timezone"?: string,"transfer_details"?: string | null,"transfer_receipt_required"?: boolean
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
                },"match_slots": {
                  Row: {
                    "club_id": string,"joined_at": string | null,"match_id": string,"player_id": string | null,"position": number,"side": Database["public"]['Enums']["player_side"],"team": string
                  }
                  Insert: {
                    "club_id": string,"joined_at"?: string | null,"match_id": string,"player_id"?: string | null,"position": number,"side": Database["public"]['Enums']["player_side"],"team": string
                  }
                  Update: {
                    "club_id"?: string,"joined_at"?: string | null,"match_id"?: string,"player_id"?: string | null,"position"?: number,"side"?: Database["public"]['Enums']["player_side"],"team"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_slots_match_in_club"
      columns: ["match_id","club_id"]
isOneToOne: false
      referencedRelation: "open_matches"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "match_slots_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"open_matches": {
                  Row: {
                    "allow_other_court": boolean,"booking_id": string | null,"cancel_note": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"category_max": number,"category_min": number,"club_id": string,"court_id": string | null,"created_at": string,"created_by": string | null,"ends_at": string | null,"id": string,"match_type": Database["public"]['Enums']["match_type"],"period": unknown,"preferred_court_id": string,"starts_at": string | null,"status": Database["public"]['Enums']["match_status"]
                  }
                  Insert: {
                    "allow_other_court"?: boolean,"booking_id"?: string | null,"cancel_note"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"category_max": number,"category_min": number,"club_id": string,"court_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"match_type": Database["public"]['Enums']["match_type"],"period": unknown,"preferred_court_id": string,"starts_at"?: never,"status"?: Database["public"]['Enums']["match_status"]
                  }
                  Update: {
                    "allow_other_court"?: boolean,"booking_id"?: string | null,"cancel_note"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"category_max"?: number,"category_min"?: number,"club_id"?: string,"court_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"match_type"?: Database["public"]['Enums']["match_type"],"period"?: unknown,"preferred_court_id"?: string,"starts_at"?: never,"status"?: Database["public"]['Enums']["match_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "open_matches_booking_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "open_matches_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "open_matches_court_fkey"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "open_matches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "open_matches_preferred_court_fkey"
      columns: ["preferred_court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"booking_id": string,"club_id": string,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"payer_id": string | null,"receipt_path": string | null,"rejection_reason": string | null,"reported_by": string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Insert: {
                    "amount": number,"booking_id": string,"club_id": string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"receipt_path"?: string | null,"rejection_reason"?: string | null,"reported_by"?: string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string,"club_id"?: string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"receipt_path"?: string | null,"rejection_reason"?: string | null,"reported_by"?: string | null,"status"?: Database["public"]['Enums']["payment_status"]
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
      foreignKeyName: "payments_payer_id_fkey"
      columns: ["payer_id"]
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
                },"player_availability": {
                  Row: {
                    "band": Database["public"]['Enums']["day_band"],"user_id": string,"weekday": number
                  }
                  Insert: {
                    "band": Database["public"]['Enums']["day_band"],"user_id": string,"weekday": number
                  }
                  Update: {
                    "band"?: Database["public"]['Enums']["day_band"],"user_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_availability_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"player_preferred_courts": {
                  Row: {
                    "court_id": string,"user_id": string
                  }
                  Insert: {
                    "court_id": string,"user_id": string
                  }
                  Update: {
                    "court_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_preferred_courts_court_id_fkey"
      columns: ["court_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_preferred_courts_user_id_fkey"
      columns: ["user_id"]
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
                    "created_at": string,"display_name": string,"gender": Database["public"]['Enums']["gender"] | null,"hand": Database["public"]['Enums']["dominant_hand"] | null,"id": string,"is_public": boolean,"side": Database["public"]['Enums']["player_side"] | null
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"gender"?: Database["public"]['Enums']["gender"] | null,"hand"?: Database["public"]['Enums']["dominant_hand"] | null,"id": string,"is_public"?: boolean,"side"?: Database["public"]['Enums']["player_side"] | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"hand"?: Database["public"]['Enums']["dominant_hand"] | null,"id"?: string,"is_public"?: boolean,"side"?: Database["public"]['Enums']["player_side"] | null
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
"match_id": string | null,
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
"match_id": string | null,
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
"cancel_match":
{ Args: { "p_match_id": string,"p_note"?: string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
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
"match_id": string | null,
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
"close_matches":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"confirm_payment":
{ Args: { "p_payment_id": string }; Returns: {
              "amount": number,
"booking_id": string,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_match":
{ Args: { "p_allow_other_court": boolean,"p_category_max": number,"p_category_min": number,"p_court_id": string,"p_match_type": Database["public"]['Enums']["match_type"],"p_side": Database["public"]['Enums']["player_side"],"p_starts_at": string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_series":
{ Args: { "p_court_id": string,"p_ends_on"?: string,"p_guest_name"?: string,"p_player_id"?: string,"p_start_time": string,"p_starts_on": string,"p_weekday": number }; Returns: {
              "club_id": string,
"created_at": string,
"id": string,
"on_date": string,
"reason": string,
"series_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "recurring_series_skips"
        isOneToOne: false
        isSetofReturn: true
      } },
"end_series":
{ Args: { "p_from_date": string,"p_series_id": string }; Returns: number
                           },
"join_match":
{ Args: { "p_match_id": string,"p_position": number }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"leave_match":
{ Args: { "p_match_id": string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"occupancy_notes":
{ Args: { "p_club_id": string,"p_from": string,"p_to": string }; Returns: {
              "id": string,"note": string
            }[]
                           },
"record_cash":
{ Args: { "p_amount": number,"p_booking_id": string,"p_payer_id"?: string }; Returns: {
              "amount": number,
"booking_id": string,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"refund_payment":
{ Args: { "p_payment_id": string }; Returns: {
              "amount": number,
"booking_id": string,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"reject_payment":
{ Args: { "p_payment_id": string,"p_reason"?: string }; Returns: {
              "amount": number,
"booking_id": string,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"remove_from_match":
{ Args: { "p_match_id": string,"p_player_id": string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_transfer":
{ Args: { "p_booking_id": string,"p_receipt_path"?: string }; Returns: {
              "amount": number,
"booking_id": string,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_my_availability":
{ Args: { "p_slots": (string)[] }; Returns: {
              "band": Database["public"]['Enums']["day_band"],
"user_id": string,
"weekday": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "player_availability"
        isOneToOne: false
        isSetofReturn: true
      } },
"save_my_preferred_courts":
{ Args: { "p_club_id": string,"p_court_ids": (string)[] }; Returns: {
              "court_id": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "player_preferred_courts"
        isOneToOne: false
        isSetofReturn: true
      } },
"save_my_profile":
{ Args: { "p_category": number,"p_club_id": string,"p_display_name": string,"p_gender": Database["public"]['Enums']["gender"],"p_hand": Database["public"]['Enums']["dominant_hand"],"p_is_public": boolean,"p_side": Database["public"]['Enums']["player_side"] }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_member_role":
{ Args: { "p_club_id": string,"p_role": Database["public"]['Enums']["club_role"],"p_user_id": string }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_my_category":
{ Args: { "p_category": number,"p_club_id": string }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
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
"match_id": string | null,
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
                           },
"validate_category":
{ Args: { "p_category": number,"p_club_id": string,"p_user_id": string }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "booking_source": "online"|"reception","booking_status": "confirmed"|"cancelled","club_role": "admin"|"reception"|"player","day_band": "morning"|"afternoon"|"night","dominant_hand": "right"|"left","gender": "male"|"female","match_status": "forming"|"confirmed"|"cancelled","match_type": "male"|"female"|"mixed","occupancy_kind": "booking"|"recurring"|"tournament"|"block"|"match"|"day_use","payment_method": "cash"|"transfer","payment_status": "reported"|"confirmed"|"rejected"|"refunded","player_side": "drive"|"backhand"|"both"
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
            "booking_source": ["online", "reception"],"booking_status": ["confirmed", "cancelled"],"club_role": ["admin", "reception", "player"],"day_band": ["morning", "afternoon", "night"],"dominant_hand": ["right", "left"],"gender": ["male", "female"],"match_status": ["forming", "confirmed", "cancelled"],"match_type": ["male", "female", "mixed"],"occupancy_kind": ["booking", "recurring", "tournament", "block", "match", "day_use"],"payment_method": ["cash", "transfer"],"payment_status": ["reported", "confirmed", "rejected", "refunded"],"player_side": ["drive", "backhand", "both"]
          }
        }
} as const

