import { redirect } from 'next/navigation'

// Mis reservas lives in Inicio since fase 3a: old links and bookmarks land there.
export default function MyBookingsPage() {
  redirect('/')
}
