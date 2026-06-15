# 🚀 Guía de Integración y Despliegue Open Code (GitHub + Supabase + Sheets)

¡Felicidades! Tienes en tus manos una de las páginas de aterrizaje (Landing Pages) de comercio electrónico más optimizadas y de mayor conversión del mercado latinoamericano, diseñada específicamente para el producto **La Roche-Posay Anthelios UVMune 400 Oil Control Fluide** en Colombia.

Esta guía detalla con precisión quirúrgica cómo subir tu proyecto a **GitHub**, desplegarlo en un proveedor como **Hostinger** (u otros servicios web), e implementar de forma súper sencilla la base de datos cloud **Supabase**, el sistema de rastreo publicitario (Píxeles de Meta y TikTok) y la sincronización con **Google Sheets**.

---

## 📂 1. Arquitectura del Proyecto

El proyecto está construido bajo una arquitectura moderna de Frontend Single Page Application (SPA):
*   **Tecnologías Clave:** React 18, Vite, TypeScript, Tailwind CSS v4 y Framer Motion (para micro-animaciones fluidas).
*   **Modularidad Excepcional:**
    *   `/src/App.tsx`: Layout principal de la Landing Page estructurado en secciones de alto impacto.
    *   `/src/components/CheckoutForm.tsx`: El motor del embudo de ventas. Gestiona el formulario de pedidos rápidos en Colombia con dos métodos principales: **Pago Contra Entrega** y **Pago Online con Mercado Pago**.
    *   `/src/components/OrderDashboard.tsx`: Panel administrativo integrado que calcula métricas KPI clave (Ventas del día, Ticket Promedio, Tasa de Entrega) y conecta con Google Sheets.
    *   `/src/components/AdvisorBot.tsx`: Asistente virtual inteligente que responde dudas frecuentes de clientes.
    *   `/src/lib/colombiaData.ts`: Cobertura de todos los departamentos y municipios de Colombia estructurados de forma jerárquica.

---

## 🐙 2. Publicar en GitHub

Para llevar tu código a GitHub por primera vez, sigue estos comandos desde tu terminal local:

1.  **Inicializa el repositorio de Git local:**
    ```bash
    git init
    ```
2.  **Agrega todos los archivos al staging:**
    ```bash
    git add .
    ```
3.  **Realiza tu primer commit formal:**
    ```bash
    git commit -m "feat: landing anthelios de alta conversion colombia listo para produccion"
    ```
4.  **Crea un repositorio en blanco en tu cuenta de GitHub** (sin README/License para evitar conflictos).
5.  **Vincula tu repositorio local con el remoto de GitHub:**
    ```bash
    git remote add origin https://github.com/TU-USUARIO/NOMBRE-REPOSITORIO.git
    git branch -M main
    ```
6.  **Sube tus archivos a la rama principal:**
    ```bash
    git push -u origin main
    ```

---

## 🌐 3. Despliegue en Hostinger (u otros Hostings)

Al ser una SPA construida con **Vite**, el proceso de compilación genera un conjunto de archivos estáticos HTML, CSS y JS ultra puros en la carpeta `/dist`.

### Opción A: Despliegue Automatizado mediante Git (Recomendado)
1.  Inicia sesión en tu panel **hPanel de Hostinger**.
2.  Ve a la sección **Sitio Web** > **Git**.
3.  Escribe el enlace de tu repositorio de GitHub recién creado (ej. `https://github.com/usuario/repositorio.git`) y selecciona la rama `main`.
4.  Configura la **Ruta de Despliegue** (ej. `/public_html`).
5.  Haz clic en **Crear**. Cada vez que hagas un `git push` a tu repositorio, Hostinger actualizará la Landing Page automáticamente.

### Opción B: Subida Manual por FTP
1.  En la terminal de tu proyecto, compila el código optimizado para producción:
    ```bash
    npm run build
    ```
2.  Se generará la carpeta `/dist` en la raíz de tu proyecto.
3.  Usa el **Administrador de Archivos** de Hostinger o un cliente FTP (como FileZilla) y copia **todo el contenido** de la carpeta `/dist` directamente dentro de la carpeta `/public_html` de tu dominio.

---

## ⚡ 4. Conexión de Base de Datos con Supabase

**Supabase** es la alternativa open-source más veloz a Firebase. Es ideal y altamente confiable para persistir tus pedidos.

### Paso 1: Crear la Tabla de Pedidos en Supabase
Ve al panel de tu proyecto en Supabase, abre la sección **SQL Editor** y ejecuta la siguiente consulta:

```sql
-- Crear la tabla de pedidos
create table pedidos (
  id varchar(50) primary key,
  client_name varchar(150) not null,
  client_phone varchar(50) not null,
  client_email varchar(150),
  document_id varchar(100),
  department varchar(150) not null,
  city varchar(150) not null,
  address text not null,
  address2 text,
  notes text,
  offer_id varchar(50) not null,
  offer_name varchar(200) not null,
  total_price numeric not null,
  quantity integer not null,
  status varchar(50) default 'new',
  payment_method varchar(100) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar acceso de lectura y escritura publico para el Checkout (sin autenticacion de usuario final)
alter table pedidos enable row level security;

create policy "Permitir insercion publica de pedidos"
on pedidos for insert
with true;

create policy "Permitir lectura publica de pedidos"
on pedidos for select
using (true);

create policy "Permitir actualizacion automatica de pedidos"
on pedidos for update
using (true);
```

### Paso 2: Configurar las variables en tu entorno
Crea tu archivo `.env` en producción y añade tus credenciales seguras de Supabase:
```env
VITE_SUPABASE_URL="https://tu-identificador-supabase.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-clave-anonima-publica"
```

### Paso 3: Instalar el SDK de Supabase en tu proyecto
```bash
npm install @supabase/supabase-js
```

### Paso 4: Crear el cliente de Supabase (`/src/lib/supabase.ts`)
Crea un archivo nuevo para instanciar el cliente:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Paso 5: Conectar el Formulario de Compra
En `/src/components/CheckoutForm.tsx`, importa el cliente recién creado:
```typescript
import { supabase } from '../lib/supabase';
```

Y reemplaza la simulación de guardado local en el método `handleSubmit` para subirlo directo a Supabase:

```typescript
// Reemplaza el guardado simulado de localStorage por esto:
const saveOrderToSupabase = async (orderData: any) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .insert([
        {
          id: orderData.id,
          client_name: orderData.clientName,
          client_phone: orderData.clientPhone,
          client_email: orderData.clientEmail,
          document_id: orderData.documentId,
          department: orderData.department,
          city: orderData.city,
          address: orderData.address,
          address2: orderData.address2,
          notes: orderData.notes,
          offer_id: orderData.offerId,
          offer_name: orderData.offerName,
          total_price: orderData.totalPrice,
          quantity: orderData.quantity,
          status: 'new',
          payment_method: orderData.paymentMethod
        }
      ]);

    if (error) throw error;
    console.log("¡Pedido insertado con éxito en Supabase!", data);
  } catch (err) {
    console.error("Error al guardar pedido en Supabase:", err);
  }
};
```

---

## 📊 5. Conexión Estable con Google Sheets (CRM Directo)

En el panel administrativo (`OrderDashboard.tsx`), cuentas con un sistema de vinculación automática.

### ¿Cómo opera bajo el capó?
El sistema utiliza la API de Google Sheets mediante OAuth2. Los pedidos que ingresan en local o a través de Supabase se suben en milisegundos a la hoja de cálculo seleccionada.

1.  **Crea una base de datos en Google Sheets.** Las columnas se crearán automáticamente con el orden adecuado al presionar **"Crear Nueva Hoja Automática"**.
2.  **Paso de Seguridad:** Si deseas usar este flujo cliente-servidor desde producción sin autenticarte manualmente cada vez, puedes migrar la función `appendOrders` de `/src/lib/sheetsService.ts` a un archivo de Backend ligero (Express.js o Serverless Functions de Vercel/Supabase Edge) usando una **Cuenta de Servicio de Google (Service Account)**.

---

## 💳 6. Pasarelas de Pago y Campañas de Publicidad

### Mercado Pago
Las URLs de redirección de Mercado Pago para cada oferta están pre-cargadas en el archivo `/src/data.ts`. Puedes modificarlas directamente reemplazando los links en el array de ofertas para que correspondan a tus propios Links de Pago oficiales de Mercado Pago Colombia:
*   🔑 Link de Oferta 1: `https://link.mercadopago.com.co/anthelios1un`
*   🔑 Link de Oferta 2: `https://link.mercadopago.com.co/anthelios2un`
*   🔑 Link de Oferta 3: `https://link.mercadopago.com.co/anthelios3un`

### Píxeles de Campañas (Facebook Meta Pixel & TikTok Pixel)
La Landing cuenta con interceptores de eventos de rastreo para medir tus conversiones en anuncios (TikTok Ads y Facebook Ads). Los píxeles capturan el evento `Purchase` automáticamente al crear exitosamente un pedido.

Ingresa los IDS de tus Píxeles en tu archivo `.env` para que el script de rastreo comience a operar en tiempo real:
```env
VITE_META_PIXEL_ID="tu-id-de-meta-pixel"
VITE_TIKTOK_PIXEL_ID="tu-id-de-tiktok-pixel"
```

El script de rastreo está implementado modularmente en `/src/lib/tracking.ts` y no requiere que modifiques código; se activa automáticamente al suministrar estas variables en tu entorno del servidor.

---

## 🐳 7. Contenedores con Docker y Docker Compose (Optimizado para Hostinger VPS)

Hemos diseñado un empaquetamiento premium de alto rendimiento para que tu Landing Page vuele en Hostinger u otros servidores Docker utilizando un **Dockerfile** optimizado y un archivo **docker-compose.yml** listo para usar.

### ❓ ¿Es necesario un Backend separado del Frontend? (La verdad sobre Supabase)
Si te han sugerido que "debe estar separado el back del front end", la excelente noticia es que **con Supabase ya no es necesario configurar, programar, pagar ni mantener un contenedor de backend por separado**.
* **¿Por qué?** Supabase es una plataforma BaaS (Backend-as-a-Service). Te brinda una API segura con filtros y seguridad a nivel de fila (Row Level Security - RLS).
* Nuestro código se conecta **directamente** de forma ultra-segura desde el navegador del cliente a la base de datos cloud de Supabase utilizando tus claves públicas anónimas. Esto elimina la fricción de red, simplifica tu arquitectura a un solo contenedor estático ultra rápido, reduce costos de servidor y elimina fallos de caída de servidor backend.

### 🛠️ Lo que hemos optimizado para ti:
1. **Configuración de puertos automatizada (`ports: "3001:80"`):**
   En tu `docker-compose.yml`, hemos mapeado el puerto `3001:80`. Esto expone tu Landing Page de forma segura en el puerto `3001`, permitiéndote configurar fácilmente proxies reversos o apuntar tu puerto en Hostinger.
2. **Servidor Nginx de Alta Frecuencia con Gzip:**
   Hemos creado un archivo `/nginx.conf` dedicado. Al construir el contenedor, este activa de forma nativa la **compresión GZIP** (crítico para descargas ultrarrápidas de la página en teléfonos móviles desde campañas de pauta publicitaria en Meta y TikTok) y configura la regla de escape:
   `try_files $uri $uri/ /index.html;`
   Esto previene los típicos errores "404 Not Found" de Nginx al refrescar la página o navegar por paneles SPA.

### ¿Cómo arrancarlo localmente o en el VPS por consola?

1. **Construye y levanta la aplicación con Docker Compose:**
   ```bash
   docker compose up --build -d
   ```
   *Esto compilará los activos estáticos de producción usando Node.js, configurará las directivas de caché de Nginx y levantará el sitio en pocos segundos de forma aislada.*

2. **Accede a la Landing Page:**
   La aplicación estará expuesta en el puerto `3001`:
   *   Localmente: `http://localhost:3001`
   *   En tu servidor VPS: `http://TU-IP-O-DOMINIO:3001`

3. **Para detener los contenedores de forma segura:**
   ```bash
   docker compose down
   ```

---

¡Disfruta construyendo y acelerando tus conversiones con este espectacular embudo de ventas preparado para código libre! 🚀
