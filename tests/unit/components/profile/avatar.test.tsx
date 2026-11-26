import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AvatarForm, type AvatarFormProps } from '@/components/profile/avatar-form'
import { ContactForm } from '@/components/profile/contact-form'
import { Avatar } from '@/components/ui/avatar'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

const NONE = { avatar_source: null, avatar_path: null, avatar_url: null }

describe('Avatar', () => {
  it('shows the uploaded photo, then the Google one, then the initials', () => {
    const { container, rerender } = render(
      <Avatar name="Paula Ramírez" profile={{ avatar_source: 'upload', avatar_path: 'u1/avatar-1.jpg', avatar_url: null }} />,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar-1.jpg')
    rerender(<Avatar name="Paula Ramírez" profile={{ avatar_source: 'google', avatar_path: null, avatar_url: 'https://lh3/a' }} />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://lh3/a')
    rerender(<Avatar name="Paula Ramírez" profile={NONE} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-initials]')).toHaveTextContent('PR')
  })

  it('falls back to the initials when the photo does not load', () => {
    const { container } = render(<Avatar name="Bruno" profile={{ avatar_source: 'google', avatar_path: null, avatar_url: 'https://lh3/gone' }} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('[data-initials]')).toHaveTextContent('B')
  })
})

describe('AvatarForm', () => {
  const PNG = new File(['png'], 'yo.png', { type: 'image/png' })
  function renderForm(overrides: Partial<AvatarFormProps> = {}) {
    const props: AvatarFormProps = {
      userId: 'u1',
      name: 'Paula Ramírez',
      profile: NONE,
      saveAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Guardamos tu foto.' })),
      removeAction: vi.fn(async () => ({ status: 'ok' as const, message: 'Quitamos tu foto.' })),
      upload: vi.fn(async () => ({ path: 'u1/avatar-1.png' })),
      ...overrides,
    }
    render(<AvatarForm {...props} />)
    return props
  }

  it('uploads the photo as soon as it is picked', async () => {
    const props = renderForm()
    await userEvent.upload(screen.getByLabelText('Tu foto'), PNG)
    await waitFor(() => expect(props.saveAction).toHaveBeenCalledWith('u1/avatar-1.png'))
    expect(props.upload).toHaveBeenCalledWith('u1', PNG)
    expect(await screen.findByRole('status')).toHaveTextContent('Guardamos tu foto.')
  })

  it('offers to remove it only when there is one', async () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir foto' })).toBeInTheDocument()
  })

  it('removes it, leaving the initials', async () => {
    const props = renderForm({ profile: { avatar_source: 'google', avatar_path: null, avatar_url: 'https://lh3/a' } })
    await userEvent.click(screen.getByRole('button', { name: 'Quitar foto' }))
    await waitFor(() => expect(props.removeAction).toHaveBeenCalled())
  })
})

describe('ContactForm', () => {
  it('shows the number as people write it and the consent unchecked by default', () => {
    render(<ContactForm action={vi.fn()} contact={{ phone: '099123456', whatsappConsent: false }} />)
    expect(screen.getByLabelText('Tu WhatsApp (opcional)')).toHaveValue('099 123 456')
    expect(screen.getByRole('checkbox', { name: /Acepto que el club me escriba por WhatsApp/ })).not.toBeChecked()
  })

  it('a player without a contact starts empty', () => {
    render(<ContactForm action={vi.fn()} contact={null} />)
    expect(screen.getByLabelText('Tu WhatsApp (opcional)')).toHaveValue('')
  })
})
