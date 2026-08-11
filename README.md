# Merch POS - Public Pre-order Storefront 🛍️

A modern, high-performance web application for customers to browse merchandise, submit custom item requests with interactive image cropping, place pre-orders, and track order status in real time.

---

## ✨ Features

- 🛍️ **Interactive Merchandise Catalog:** Browse categories, view item variants, check real-time stock levels, and search items instantly.
- 🎨 **Custom Item Request & Image Cropper:** Built-in image upload tool with circular cropping and zoom controls powered by `react-easy-crop` for custom design submissions.
- 🛒 **Dynamic Shopping Cart:** Add items, adjust quantities, select custom variants, and preview order total calculation before checkout.
- 📦 **Order Tracking:** Track order details, status, and payment progress directly by Order ID.
- ⚡ **High Performance & Responsive:** Built with React 19, Vite 8, and Tailwind CSS v4 featuring dark mode styling optimized for desktop and mobile devices.

---

## 🛠️ Tech Stack

- **Framework:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite 8](https://vitejs.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **State & Data Fetching:** [@tanstack/react-query v5](https://tanstack.com/query/latest)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Image Editing:** `react-easy-crop`
- **Linting:** [Oxlint](https://oxc.rs/)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [pnpm](https://pnpm.io/) package manager

### Environment Configuration

Create a `.env` file in the project root (or copy `.env.example`):

```bash
cp .env.example .env
```

Configure your backend API URL:

```env
VITE_API_URL=http://localhost:3000
```

### Installation & Development

```bash
# Install dependencies
pnpm install

# Start local development server
pnpm dev

# Lint code with Oxlint
pnpm lint

# Build production bundle
pnpm build

# Preview production build
pnpm preview
```

---

## 📁 Project Structure

```text
merch/
├── .github/workflows/   # GitHub Actions deployment workflow (GitHub Pages)
├── src/
│   ├── lib/             # API client, image cropper utilities & helpers
│   ├── App.tsx          # Main Storefront Application
│   ├── main.tsx         # App entry point
│   ├── index.css        # Global CSS & Tailwind imports
│   └── App.css          # Custom utility classes
├── public/              # Static assets
└── vite.config.ts       # Vite configuration (with GitHub Pages base path)
```

---

## 🌐 Deployment (GitHub Pages)

This public storefront is deployed on **GitHub Pages** via GitHub Actions.

### Automated Deployment Workflow

Any push to the `main` or `master` branch triggers the automated GitHub Actions workflow (`.github/workflows/deploy.yml`) which builds the production application and deploys it to GitHub Pages.

### Repository Variables (GitHub Actions)

Configure the following GitHub Repository Variables under **Settings > Secrets and variables > Actions > Variables**:

- `VITE_API_URL`: Backend API endpoint URL (e.g. `https://api.yourdomain.com`)
- `VITE_PAYMENT_NAME`: Account name displayed for payment instructions
- `VITE_GCASH_NUMBER`: GCash account number
- `VITE_MAYA_NUMBER`: Maya account number

