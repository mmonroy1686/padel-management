// The legal pages' text: a DRAFT for Uruguay (Ley 18.331 de Protección de Datos Personales) that Miguel reviews with
// whoever advises him. It is not legal advice. Every "[COMPLETAR: …]" is a gap to fill before the pilot; while one is
// left, the page says it is a draft.

export type LegalSection = { title: string; paragraphs: string[]; items?: string[] }
export type LegalDocument = { title: string; updated: string; intro: string; sections: LegalSection[] }

export const GAP = /\[COMPLETAR:[^\]]*\]/g

export function gapsIn(document: LegalDocument): string[] {
  const text = JSON.stringify(document)
  return [...new Set(text.match(GAP) ?? [])]
}

// The product's name, still undecided: from the environment, or a visible gap.
export function productName(env: { NEXT_PUBLIC_PRODUCT_NAME?: string } = { NEXT_PUBLIC_PRODUCT_NAME: process.env.NEXT_PUBLIC_PRODUCT_NAME }): string {
  return env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || '[COMPLETAR: nombre del producto]'
}

const OPERATOR = '[COMPLETAR: razón social], RUT [COMPLETAR: RUT], con domicilio en [COMPLETAR: domicilio]'
const CONTACT = '[COMPLETAR: email de contacto]'

export function termsOfService(product = productName()): LegalDocument {
  return {
    title: 'Términos y condiciones',
    updated: '[COMPLETAR: fecha de vigencia]',
    intro: `${product} es una aplicación para reservar canchas de pádel y participar de las actividades de un club (partidos, torneos, campeonatos y day use). La ofrece ${OPERATOR} ("nosotros") a los clubes que la usan. Al crear una cuenta o usar la aplicación aceptás estos términos.`,
    sections: [
      {
        title: 'Quién es quién',
        paragraphs: [
          `Cada club que usa ${product} administra sus canchas, precios, reglas de reserva y cancelación, cobros y actividades. Nosotros ponemos la aplicación; el club es quien presta el servicio deportivo y responde por él.`,
        ],
      },
      {
        title: 'Tu cuenta',
        paragraphs: [
          'Ingresás con tu email (te mandamos un enlace) o con Google. Sos responsable de lo que se haga con tu cuenta y de que tus datos (nombre, categoría y, si lo das, teléfono) sean ciertos.',
          'El club puede revisar y corregir tu categoría, y puede suspender tu acceso si no respetás sus reglas.',
        ],
      },
      {
        title: 'Reservas y cancelaciones',
        paragraphs: [
          'Cada reserva sigue las reglas del club: anticipación máxima, cantidad de reservas abiertas y plazo para cancelar sin cargo. La aplicación te muestra esas reglas antes de confirmar.',
          'Si cancelás fuera de plazo o no te presentás, el club puede cobrarte el turno según sus reglas.',
        ],
      },
      {
        title: 'Pagos',
        paragraphs: [
          `${product} no cobra pagos en línea. Pagás en el club, en efectivo, con tarjeta o por transferencia, según lo que acepte cada club. Cuando pagás por transferencia, el club confirma el pago al ver el comprobante.`,
          'Las devoluciones, cuando correspondan, las hace el club por el mismo medio o el que acuerden.',
        ],
      },
      {
        title: 'Uso correcto',
        paragraphs: ['No está permitido usar la aplicación para reservar a nombre de otra persona sin su consentimiento, sobrecargarla, intentar acceder a datos de otros o a funciones que no te corresponden.'],
      },
      {
        title: 'Disponibilidad y responsabilidad',
        paragraphs: [
          'Hacemos lo posible para que la aplicación funcione siempre, pero puede haber interrupciones. No respondemos por lo que pase en las canchas ni por la relación entre vos y el club, que sigue sus propias reglas.',
        ],
      },
      {
        title: 'Cambios en estos términos',
        paragraphs: ['Si cambiamos estos términos te lo vamos a avisar en la aplicación. Si seguís usándola después del aviso, aceptás la nueva versión.'],
      },
      {
        title: 'Ley y jurisdicción',
        paragraphs: [`Estos términos se rigen por las leyes de la República Oriental del Uruguay. Cualquier diferencia se resuelve ante los tribunales de [COMPLETAR: departamento]. Por consultas, escribinos a ${CONTACT}.`],
      },
    ],
  }
}

export function privacyPolicy(product = productName()): LegalDocument {
  return {
    title: 'Política de privacidad',
    updated: '[COMPLETAR: fecha de vigencia]',
    intro: `Esta política explica qué datos personales usa ${product}, para qué y qué derechos tenés, según la Ley N° 18.331 de Protección de Datos Personales y su reglamentación.`,
    sections: [
      {
        title: 'Responsables',
        paragraphs: [
          `El club en el que te registrás es el responsable de la base de datos de sus socios y jugadores. ${OPERATOR} trata esos datos por cuenta del club, como encargado, para que la aplicación funcione.`,
        ],
      },
      {
        title: 'Qué datos usamos',
        paragraphs: ['Los que nos das y los que se generan al usar la aplicación:'],
        items: [
          'Tu nombre y tu email.',
          'Si te anotás en un campeonato, tu email y el teléfono que nos des. Si anotás a una pareja que no usa la aplicación, su nombre y teléfono: avisale que los compartís.',
          'Tu perfil de juego: categoría, lado, mano, género y horarios en los que preferís jugar.',
          'Tus reservas, partidos, inscripciones a torneos y campeonatos, pases de day use y la lista de espera.',
          'Tus pagos: monto, medio, estado y el comprobante de transferencia que subas.',
          'Datos técnicos necesarios para tu sesión (cookies de inicio de sesión). No usamos cookies de publicidad.',
        ],
      },
      {
        title: 'Para qué los usamos',
        items: [
          'Reservar y administrar turnos, partidos y actividades del club.',
          'Armar partidos y avisarte de turnos libres, invitaciones o lugares que se liberan, por email y dentro de la aplicación.',
          'Registrar y confirmar pagos.',
          'Mostrar fixtures y resultados de campeonatos: tu nombre y el de tu pareja aparecen en la página pública del campeonato.',
          'Detectar y corregir errores de la aplicación.',
        ],
        paragraphs: [],
      },
      {
        title: 'Lo que no hacemos',
        paragraphs: ['No vendemos tus datos ni los usamos para publicidad.'],
      },
      {
        title: 'Quién los ve',
        paragraphs: [
          'El personal del club (administración y recepción) ve los datos necesarios para atenderte. Otros jugadores ven tu nombre en los partidos, torneos y campeonatos en los que participás; el fixture de un campeonato es una página pública que puede ver cualquiera con el enlace.',
          'Si tu perfil es visible (viene activado y lo podés apagar en Tu perfil, en «Otros jugadores pueden ver mi perfil»), los jugadores del club ven tu nombre, categoría, lado, mano y género. Además, cuando alguien arma un partido, la aplicación le sugiere jugadores de su nivel y le muestra cuántas veces jugaste en ese horario y si solés estar libre, según tus reservas anteriores. Con el perfil oculto no aparecés en esas sugerencias.',
          'Si registrás tu ingreso de day use, los otros jugadores ven tu nombre en «Ya están en el club», salvo que lo apagues en Tu perfil.',
          'Para funcionar usamos proveedores que guardan o procesan datos por nuestra cuenta, con sus propias medidas de seguridad, algunos fuera de Uruguay:',
        ],
        items: [
          'Supabase (base de datos, archivos e inicio de sesión).',
          'Vercel (servidores de la aplicación).',
          'Resend (envío de emails).',
          'Sentry (registro de errores: le mandamos el error y la pantalla en la que pasó; los emails y teléfonos se borran antes de enviarlo).',
          'Google, solo si elegís ingresar con tu cuenta de Google.',
        ],
      },
      {
        title: 'Cuánto tiempo los guardamos',
        paragraphs: [
          'Mientras tengas tu cuenta en el club. Si pedís que la borremos, eliminamos tus datos personales, salvo los registros de reservas y pagos que el club deba conservar por obligaciones legales o contables, durante [COMPLETAR: plazo de conservación].',
        ],
      },
      {
        title: 'Tus derechos',
        paragraphs: [
          `Podés pedir en cualquier momento acceder a tus datos, corregirlos, actualizarlos o que los eliminemos, escribiendo a ${CONTACT} o al club. Te respondemos en los plazos de la ley. Si no quedás conforme, podés recurrir a la Unidad Reguladora y de Control de Datos Personales (URCDP).`,
        ],
      },
      {
        title: 'Seguridad',
        paragraphs: ['Los datos viajan cifrados, cada club solo accede a lo suyo y el personal del club solo a lo que su rol permite. Los respaldos se guardan cifrados.'],
      },
      {
        title: 'Cambios',
        paragraphs: ['Si cambiamos esta política te lo vamos a avisar en la aplicación.'],
      },
    ],
  }
}
