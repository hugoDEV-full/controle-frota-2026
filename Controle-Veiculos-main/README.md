# Sistema de Controle de Frota (Controle de Veículos)

Sistema web de gerenciamento de frota feito em **Node.js + Express + MySQL**, com autenticação, controle de uso de veículos, multas, reembolsos, manutenções, GPS em tempo real, módulo VoIP, notificações e auditoria.

---

## Tecnologias

- **Node.js & Express** — servidor e rotas
- **MySQL (mysql2)** — banco de dados relacional
- **EJS + express-ejs-layouts** — views server-side
- **Bootstrap 5 + bootstrap-icons** — interface responsiva
- **Passport (Local Strategy)** — autenticação com email/senha
- **express-session + session-file-store** — sessões persistentes
- **csurf** — proteção CSRF nos formulários
- **helmet** — headers de segurança HTTP
- **express-rate-limit** — proteção contra força bruta no login
- **Multer** — upload de imagens (com validação de tipo e tamanho)
- **Socket.IO** — notificações em tempo real
- **Nodemailer** — recuperação de senha e alertas por email
- **Docker + docker-compose** — deploy em produção (app + MySQL + módulo GPS)

---

## Vídeo de apresentação

Apresentação narrada (2min42s, Full HD) mostrando todas as telas e funcionalidades:

- **Dentro do sistema**: página **Tutorial** (`/tutorial`) tem os botões Assistir/Baixar
- **Direto**: [`public/video/apresentacao-controle-frota.mp4`](public/video/apresentacao-controle-frota.mp4)

---

## Início rápido (um comando)

### Windows

```bat
iniciar.bat dev     :: roda local com Node.js (desenvolvimento)
iniciar.bat prod    :: sobe tudo com Docker (app + MySQL + GPS)
```

### Linux / macOS

```bash
chmod +x iniciar.sh
./iniciar.sh dev    # desenvolvimento local
./iniciar.sh prod   # produção com Docker
```

O inicializador verifica pré-requisitos (Node.js ou Docker), cria o `.env` a partir do `.env.example` se não existir, instala dependências e sobe o sistema.

---

## Rodando em desenvolvimento (local)

Pré-requisitos: **Node.js 18+** e **MySQL 8** rodando localmente.

1. Copie o `.env.example` para `.env` e preencha a senha do seu MySQL (`DB_PASSWORD`).
2. Rode `iniciar.bat dev` (Windows) ou `./iniciar.sh dev`.
3. Acesse `http://localhost:3000`.

Na primeira execução, o sistema **cria as tabelas e os usuários automaticamente** (seed automático na inicialização). Também é possível rodar manualmente:

```bash
npm run seed     # carga inicial do banco
npm start        # sobe o servidor
```

### Usuários criados pelo seed (troque as senhas em produção!)

| Email | Senha | Perfil |
|---|---|---|
| hugo.leonardo.jobs@gmail.com | Hugo2026* | admin |
| admin@frota.com | Hugo2026* | admin |
| usuario@frota.com | Hugo2026* | user |

### Página de demonstração

Sem login, acesse `http://localhost:3000/demo` para uma vitrine pública das funcionalidades.

---

## Rodando em produção (Docker)

Pré-requisitos: **Docker** com docker compose.

1. Copie o `.env.example` para `.env` e configure com valores de produção (senhas fortes, `NODE_ENV=production`, `SECRET_SESSION` gerado com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Coloque os certificados SSL na pasta `certs/` (`privkey.pem` e `fullchain.pem`) — o compose os monta em `/certs`.
3. Rode `iniciar.bat prod` ou `./iniciar.sh prod`.

Serviços sobem:

| Serviço | Porta | Descrição |
|---|---|---|
| controleveiculos | 3070 (HTTPS) | Aplicação principal |
| mysql_controleveiculos | 3367 → 3306 | Banco MySQL 8 (volume persistente) |
| controle-veiculo-gps | 4999 | Módulo GPS (recebimento de posições) |

Comandos úteis:

```bash
docker compose logs -f      # acompanhar logs
docker compose down         # parar tudo
docker compose up -d --build # rebuildar após mudanças
```

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | sim (local) | Conexão MySQL por variáveis individuais |
| `MYSQL_URL` ou `MYSQL_PUBLIC_URL` | não | URL completa do banco (Railway/produção); tem prioridade sobre as individuais |
| `SECRET_SESSION` | sim | Segredo da sessão (gere uma chave forte) |
| `PORT` | não | Porta HTTP (padrão 3000) |
| `NODE_ENV` | não | `development` ou `production` |
| `HTTPS_ENABLED` | não | `true` para servir HTTPS com certificados |
| `SSL_KEY_PATH` / `SSL_CERT_PATH` | se HTTPS | Caminhos dos certificados |
| `EMAIL_USER` / `EMAIL_PASS` | recomendado | Envio de emails (use senha de app do Gmail) |
| `NOTIFY_EMAIL` | não | Email que recebe alertas de manutenção |
| `GPS_DB_*` | não | Banco separado para GPS; se vazio, usa o banco principal |

---

## Branches

| Branch | Uso |
|---|---|
| `main` | Versão estável, roda local e em produção |
| `dev-local` | Preparada para desenvolvimento local (Node + MySQL local) |
| `prod-docker` | Preparada para produção com Docker |

---

## Segurança

- Senhas com hash **bcrypt**
- Proteção **CSRF** (csurf) nos formulários sensíveis
- **Rate limiting** em `/login` e `/forgot-password` (100 tentativas / 15 min)
- Headers de segurança via **helmet**
- Uploads restritos a imagens, máx. **10 MB** por arquivo
- Pasta `/uploads` só acessível **autenticado**
- Sessões com cookie `httpOnly` e expiração de 30 min
- Queries parametrizadas (sem concatenação de SQL com entrada do usuário)
- **Auditoria**: todas as ações são registradas em banco
- Variáveis sensíveis fora do git (`.env`, `.sessions/`, `uploads/` no `.gitignore`)

Mais detalhes em `security.md`.

---

## Funcionalidades

### Para usuários comuns

- Login/logout e recuperação de senha por email
- Iniciar uso de veículo (km inicial automático, verificações de integridade)
- Finalizar uso (km final + foto do odômetro)
- Relatórios de uso paginados

### Para administradores

- CRUD de veículos, motoristas e usuários (perfis admin/user)
- Gestão de multas, reembolsos e abastecimentos
- Manutenções preventivas com alertas por km + manutenções manuais com anexos
- Relatórios: uso, multas, consumo, violações, estatísticas avançadas
- Avaliação FIPE (conserto viável)
- **GPS**: mapa de usos, histórico de trajetos, geofences, últimas localizações
- **VoIP**: módulo de comunicação com softphone WebRTC
- Auditoria completa de ações
- Notificações em tempo real (Socket.IO)

---
## Tutorial de Uso do Sistema

> **Localização**: `views/tutorial.ejs` ou diretamente aqui em Markdown.

### Sumário

1. [Acessando o Sistema](#acessando-o-sistema)
2. [Perfis de Acesso](#perfis-de-acesso)
3. [Cadastro de Motorista](#cadastro-de-motorista)
4. [Registro de Veículo (Admin)](#registro-de-veiculo-admin)
5. [Registrando um Uso](#registrando-um-uso)
6. [Finalizando um Uso](#finalizando-um-uso)
7. [Visualizando Relatórios](#visualizando-relatorios)
8. [Relatório de Multas](#relatorio-de-multas)
9. [Gerenciando Reembolsos](#gerenciando-reembolsos)
10. [Controle de Manutenções](#controle-de-manutencoes)
11. [Gerenciamento de Usuários](#gerenciamento-de-usuarios)
12. [Avaliação FIPE](#avaliacao-fipe)
13. [Fotos da CNH](#fotos-da-cnh)
14. [Geo-fence (Admin)](#geo-fence-admin)
15. [Auditoria](#auditoria)

---

### 1. Acessando o Sistema

1. Abra o navegador e acesse `http://localhost:3000`.
2. Preencha email e senha.
3. Clique em **Entrar**.
4. Sucesso → Dashboard. Em caso de erro, tente novamente ou redefina a senha.

### 2. Perfis de Acesso

- **Admin**: Acesso total às funcionalidades.
- **Motorista**: Registra usos e visualiza relatórios próprios.

### 3. Cadastro de Motorista

1. No Dashboard, vá para **Registro de Motorista**.
2. Preencha nome, email, CNH, validade e faça upload da foto.
3. Clique em **Salvar**.
4. Veja confirmação ou corrija erros.

### 4. Registro de Veículo (Admin)

1. Dashboard → **Registrar Veículo**.
2. Preencha placa, km atual, modelo, ano, cor e ID GPS.
3. Clique em **Salvar Veículo**.
4. Verifique o veículo listar com opções de editar/excluir.

### 5. Registrando um Uso

1. Dashboard → **Registrar Uso**.
2. Campos pré-preenchidos: motorista, km inicial e data/hora.
3. Preencha finalidade e descrição.
4. Defina pontos no mapa (início e fim).
5. Clique em **Registrar Uso**.
6. Registro gravado com km_final e hora_final nulos.

### 6. Finalizando um Uso

1. Abra **Relatório de Uso** e clique em **Editar** no registro.
2. Preencha km final, data/hora final e faça upload da foto do odômetro.
3. Clique em **Salvar Alterações**.
4. O km do veículo é atualizado e disparadas checagens de manutenção.

### 7. Visualizando Relatórios

- **Relatório de Uso**: Tabela geral com todos os usos.
- **Viagens**: Cartões detalhados com mapas, filtros por placa, motorista e datas.

### 8. Relatório de Multas

1. Menu → **Multas**.
2. Lista de infrações com placa, data/hora e descrição.

### 9. Gerenciando Reembolsos

1. Menu → **Novo Reembolso**.
2. Selecione motorista, informe valor e faça upload do comprovante.
3. Clique em **Salvar**.
4. Veja relatórios diários, mensais, anuais e gráficos.

### 10. Controle de Manutenções

- Executado automaticamente após finalização de uso.
- Alertas ao atingir limite de km.
- Menu → **Manutenções** para marcar como realizadas.

### 11. Gerenciamento de Usuários

1. Menu → **Usuários** → **Novo Usuário**.
2. Preencha nome, email, senha e perfil.
3. Clique em **Salvar**.
4. Edite ou exclua via ícones de lápis e lixeira.

### 12. Avaliação FIPE

1. Menu → **Conserto Viável**.
2. Selecione marca, modelo e ano na tabela FIPE.
3. Informe custo e clique em **Calcular**.
4. Exibe valor FIPE, percentual e viabilidade.
5. Clique em **Salvar Avaliação** para histórico.

### 13. Fotos da CNH

1. Menu → **Fotos da CNH**.
2. Galeria de miniaturas.
3. Clique na miniatura para ampliar.

### 14. Geo-fence (Admin)

1. Menu → **GPS Controle**.
2. Visualize mapa com áreas delimitadas e posição dos veículos.
3. Receba alertas visuais ao entrar/sair das zonas.

### 15. Auditoria

- Registra todas as ações dos usuários (rota, horário, dados).
- Acesse histórico para conferências e segurança.

---

*Documentação gerada em 2025-07-08*
