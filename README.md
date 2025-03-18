# **Prompt Hub** 🚀  

Welcome to **Prompt Hub**, a **Sonic-powered** Solana application for discovering, creating, and improving AI-generated prompts. This project consists of a **Next.js frontend** and a **FastAPI backend**, leveraging **Sonic (Solana's parallelized execution runtime)** for fast, scalable transactions on the **Solana blockchain**.  

---

## **Table of Contents**  
- [Project Overview](#project-overview)  
- [Features](#features)  
- [Tech Stack](#tech-stack)  
- [Solana & Sonic Integration](#solana--sonic-integration)  
- [Folder Structure](#folder-structure)  
- [Installation & Setup](#installation--setup)  
- [Environment Variables](#environment-variables)  
- [Running the Project](#running-the-project)  
- [Deployment](#deployment)  
- [Contributing](#contributing)  
- [License](#license)  

---

## **Project Overview**  
Prompt Hub is designed to help users:  
✅ Browse AI-generated prompts  
✅ Improve and optimize prompts  
✅ Chat with an AI assistant  
✅ Manage profiles and saved prompts  
✅ Store and verify AI-generated content using **Solana** smart contracts  
✅ Execute transactions **fast** with **Sonic**  

It is a **full-stack web application** leveraging:  
- **Next.js** for the frontend  
- **FastAPI** for the backend  
- **PostgreSQL** as the database  
- **Solana & Sonic** for blockchain-based storage & verification  
- **Tailwind CSS** for styling  
- **TypeScript** for type safety  

---

## **Features**  
### 🔹 **Frontend (Next.js)**
- Server-side rendering (SSR) & static site generation (SSG)  
- API routes for communication with the backend  
- UI components built with **ShadCN** and **Tailwind CSS**  

### 🔹 **Backend (FastAPI)**
- REST API endpoints for handling requests  
- User authentication & security  
- Prompt storage & retrieval  

### 🔹 **Solana & Sonic Integration**
- Smart contract execution on **Solana** for immutable prompt storage  
- **Sonic-powered** fast transactions for user interactions  
- **Anchor framework** for Solana program development  
- Wallet integration using **Solana Wallet Adapter**  

---

## **Tech Stack**  
| Stack        | Technology |
|-------------|-----------|
| Frontend    | Next.js (TypeScript) |
| Backend     | FastAPI (Python) |
| Database    | PostgreSQL |
| Blockchain  | Solana + Sonic |
| UI Library  | Tailwind CSS, ShadCN |
| State Mgmt  | React Hooks, Context API |
| API         | REST APIs |
| Auth        | JWT-based authentication + Solana Wallet Adapter |
| Smart Contracts | Solana Program Library (SPL), Anchor |
| Deployment  | Vercel (Frontend), Render (Backend) |

---

## **Solana & Sonic Integration**  
### **Why Solana?**  
- **Low-cost, high-speed transactions** (ideal for AI-powered prompt storage)  
- **On-chain verification** of prompt authenticity  
- **NFT minting** for exclusive AI-generated content  

### **Why Sonic?**  
- **Optimized parallel execution** → Faster transactions  
- **Better scalability** for AI applications  
- **Minimal latency** for user interactions  

### **How We Use Solana in Prompt Hub**
- **Store prompts on Solana**: Every prompt submitted by users is stored on-chain for immutability.  
- **Sonic-powered transactions**: All transactions (prompt uploads, edits, and verifications) are executed via Sonic for speed.  
- **Wallet authentication**: Users can sign in with their Solana wallets to interact with prompts.  

#### **Solana Program Example (Rust)**
```rust
use anchor_lang::prelude::*;

declare_id!("YourProgramID");

#[program]
mod prompt_hub {
    use super::*;

    pub fn store_prompt(ctx: Context<StorePrompt>, content: String) -> Result<()> {
        let prompt = &mut ctx.accounts.prompt;
        prompt.creator = *ctx.accounts.user.key;
        prompt.content = content;
        Ok(())
    }
}

#[account]
pub struct Prompt {
    pub creator: Pubkey,
    pub content: String,
}
```

---

## **Folder Structure**  
```
prompt-hub/
│── api/                     # Backend (FastAPI)
│   ├── main.py              # FastAPI entry point
│   ├── models.py            # Database models
│   ├── routers/             # API routes
│   ├── solana.py            # Solana transaction logic
│   ├── security.py          # Authentication logic
│   └── config.py            # Environment configuration
│
│── app/                     # Frontend (Next.js)
│   ├── api/                 # API route handlers
│   ├── browse/              # Browse AI-generated prompts
│   ├── chat/                # Chat page
│   ├── profile/             # User profile
│   ├── solana/              # Solana wallet connection
│   ├── layout.tsx           # App layout
│   ├── page.tsx             # Main entry point
│
│── smart-contracts/         # Solana programs (Rust)
│   ├── src/                 # Anchor framework contracts
│   ├── Cargo.toml           # Rust dependencies
│
│── .env                     # Environment variables
│── package.json             # Dependencies
│── requirements.txt         # Backend dependencies
│── render.yaml              # Deployment config for Render
│── tailwind.config.js       # Tailwind configuration
```

---

## **Installation & Setup**  
### **Prerequisites**  
- **Node.js** (v18+)  
- **Python** (v3.10+)  
- **PostgreSQL** (for database)  
- **Solana CLI** (for smart contract deployment)  
- **Anchor framework**  

### **1. Clone the Repository**  
```sh
git clone https://github.com/your-username/prompt-hub.git
cd prompt-hub
```

### **2. Install Dependencies**  
#### **Frontend**  
```sh
cd app
npm install
```
#### **Backend**  
```sh
cd api
pip install -r requirements.txt
```

### **3. Set Up Environment Variables**  
#### **Frontend (`app/.env.local`)**  
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXTAUTH_SECRET=your_secret_key
```

#### **Backend (`api/.env`)**  
```
DATABASE_URL=postgresql://user:password@localhost:5432/prompt_hub
SECRET_KEY=your_secret_key
ALGORITHM=HS256
SOLANA_RPC_URL=https://api.devnet.solana.com
```

---

## **Running the Project**  
### **Start the Backend (FastAPI)**  
```sh
cd api
uvicorn main:app --reload
```

### **Start the Frontend (Next.js)**  
```sh
cd app
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.  

### **Deploy Solana Smart Contract**  
```sh
cd smart-contracts
anchor build
solana program deploy target/deploy/prompt_hub.so
```

---

## **Deployment**  
### **Frontend (Vercel)**  
```sh
vercel deploy
```

### **Backend (Render)**  
1. Create a **Render.com** account  
2. Set up a **new web service**  
3. Link the repository and configure the `.env` variables  
4. Deploy!  

### **Solana Program (Mainnet-beta)**  
```sh
solana program deploy --network mainnet-beta target/deploy/prompt_hub.so
```

---

## **Contributing**  
We welcome contributions! Follow these steps:  
1. **Fork the repository**  
2. **Create a feature branch**:  
   ```sh
   git checkout -b feature-name
   ```
3. **Make changes and commit**:  
   ```sh
   git commit -m "Added a new feature"
   ```
4. **Push to GitHub**:  
   ```sh
   git push origin feature-name
   ```
5. **Create a pull request** (PR)  

---

## **License**  
📜 **MIT License**  
This project is open-source and free to use.  

---

### **🚀 Built for the Future – AI, Solana, and Sonic!**  
For any questions, feel free to open an issue or reach out. 🚀