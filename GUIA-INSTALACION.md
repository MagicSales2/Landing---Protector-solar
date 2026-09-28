# Guía de instalación ( paso a paso )

Todo lo que hace falta para que la página quede publicada. Si algo se traba, escríbeme y lo hacemos juntos.

> **Estado actual (28 sept 2026):** ya están hechos, probados y funcionando:
> - Las tablas y la seguridad en Supabase (pedidos, ofertas, administrador, configuración).
> - La función `crear-pedido` en Edge Functions, con el secreto `KOMMO_TOKEN` puesto.
> - La conexión con Kommo: tipo de pedido, cantidad, producto, medio de pago y etapa correcta.
> - Los videos comprimidos (la página pasó de 89 MB a ~10 MB).
>
> Lo único que falta para publicar es lo del **Paso 1** (secretos de GitHub) y el **Paso 2** (commits y push). Después te recomiendo hacer el **Paso 3** (limpiar las pruebas) y los pasos finales de seguridad.

---

## Paso 1 · Guardar los datos de conexión en GitHub

1. Entra a <https://github.com/MagicSales2/Landing---Protector-solar/settings/secrets/actions>.
2. Presiona **New repository secret** y crea estos dos (los de píxeles son opcionales):

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://drzbxmajsbkdkydsbjzj.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | *(la clave pública de Supabase; la tengo guardada en `/tmp/opencode/anon.key` del entorno de trabajo)* |
   | `VITE_META_PIXEL_ID` | *(opcional, si ya tienes tu código de Meta)* |
   | `VITE_TIKTOK_PIXEL_ID` | *(opcional)* |

   Sin el primer y el segundo secreto, la página publica igual pero los pedidos **no** se guardan.

---

## Paso 2 · Publicar la página (Commit y Push)

1. Abre **GitHub Desktop**.
2. Agrega el repositorio `MagicSales2/Landing---Protector-solar`.
3. En **Changes** selecciona todos los archivos modificados y presiona **Commit**.
4. Presiona **Push** (arriba dice *Push origin*).
5. Una vez subido, ve a <https://github.com/MagicSales2/Landing---Protector-solar/actions>. En unos 2 minutos aparecerá en verde el trabajo **Publicar landing**.
6. La página queda actualizada en <https://magiasales2.github.io/Landing---Protector-solar/>.

> **Importante:** cada vez que quieras publicar un cambio, repites solo este paso: Commit + Push en GitHub Desktop.

---

## Paso 3 · Limpiar las ventas y contactos de prueba en Kommo

Durante las pruebas se crearon muchas ventas y contactos de **prueba**. La API de Kommo no permite borrarlos con un botón, así que se borran a mano:

1. Entra a Kommo → **Ventas** → en el buscador, escribe: `PRUEBA` y borra todas las que aparezcan.
2. Repite con los prefijos: `ESTRES`, `VENTANA`, `REPRO`, `AB`, `PRUEBA POST LEADS`, `PRUEBA CON CONTACTO`, `DEBUG VERIFICACION`, `PRUEBA ORDEN EXACTO`, `E-`, `M`, `LINK CT`.
3. Ve a **Contactos** y borra los contactos de prueba que tengan teléfonos tipo `+57 3…` repetidos o nombres `CT*`, `LINK CT`, `PRUEBA FLUJO COMPLETO`, `ESTRES`.
4. Deja intactos los datos que vengan de pedidos reales.

> En Supabase **sí** ya limpié toda la base de datos de prueba: quedó vacía y lista para el primer pedido real (los números de pedido volverán a empezar en 1).

---

## Paso 4 · Probar que todo funciona (cuando esté publicado)

1. Abre la página en una ventana de **incógnito** (para no ver tu propio panel).
2. Llena el formulario con datos de prueba (teléfono real con 10 dígitos).
3. En Kommo debe aparecer la venta en el embudo **Landing Page**, con:
   - Etapa correcta: Mercado Pago o Contra entrega (que a su vez depende de si piden 1, 2 o 3 unidades).
   - Campos: quién recibe, celular, documento, dirección, ciudad, cantidad, total, producto y **medio de pago**.
4. Prueba las **dos** formas de pago para ver los dos comportamientos.
5. En la página, abajo a la derecha, abre el panel con tu usuario: deberías ver el pedido listado.

---

## Para cambiar precios después

1. Supabase → **Table Editor** → tabla `ofertas`.
2. Cambia el valor de `precio` y presiona **Save**.
3. Recarga la página. No hay que volver a publicar nada.

---

## Nota sobre los llamados "duplicados" de "Medio De Pago"

En tu Kommo el campo **Medio De Pago** tenía opciones duplicadas y una que estaba dañada (la que decía "Mercado Pago" en realidad guardaba "PayU"). Por eso la lista de opciones de ese campo se **reconstruyó** con una sola opción limpia de cada tipo:

- **ContraEntrega**
- **Mercado Pago**
- Bancolombia, Nequi, Davivienda, Efecty, Gana, PayU y Abono (por si algún día las usas).

Esto se hizo con el ID canónico de cada una y quedó guardado en la configuración. Si algún día alguien agrega o borra opciones desde la interfaz de Kommo, avísame para actualizar la configuración.

---

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| "La página todavía no tiene configurado el servidor de pedidos" | Faltan los secretos `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en GitHub o no se ha hecho el Push. |
| "La función no está configurada todavía" | Falta el secreto `KOMMO_TOKEN` en Edge Functions (ya está puesto, pero si se revoca hay que volver a ponerlo). |
| "La oferta seleccionada no está disponible" | La oferta quedó con `activo = false` en la tabla `ofertas`. |
| El pedido se guarda pero no aparece en Kommo | Normal si Kommo está caído: el pedido **no se pierde**. Queda marcado el error en `sync_log` y la columna `kommo_estado = error`. |
| En Kommo el medio de pago a veces no aparece | Es una automatización interna de Kommo que a veces borra ese campo al crear la venta. La función **lo revisa y lo reescribe sola**; si aun así faltara, queda marcado como `enviado_con_aviso` y se puede corregir a mano con el comentario de la venta. |
| El panel pide usuario y contraseña y no entra | El correo de Authentication no coincide con el correo `magiapastelera2@gmail.com` que ya está registrado como administrador. |

---

## Aviso de seguridad (muy importante)

El token de Kommo y un access token de Supabase quedaron escritos en este chat mientras trabajábamos. Cuando termines de probar todo, hay que:

1. **Revocar el token de Kommo** en Configuración → Integraciones → API de Kommo, generar uno nuevo y pegarlo en Edge Functions → `crear-pedido` → Secrets.
2. **Borrar el access token de Supabase** en Account → Access Tokens.

Cuéntame y te acompaño en ambos pasos para que el nuevo token quede guardado sin volver a escribirlo en el chat.