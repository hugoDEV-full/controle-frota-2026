# Sistema de Gerenciamento de Veículos

Esse sistema é um app de gerenciamento de frota feito em Node.js com Express e MySQL. Ele reúne várias features: autenticação com Passport, controle de sessões, upload de imagens, registro e gerenciamento de veículos, controle de multas, recuperação de senha, notificações em tempo real e muito mais. Cada usuário só vê o que tem permissão para ver, com autorização baseada em roles.

---

## Tecnologias

- **Node.js & Express**: Servidor e APIs REST.
- **MySQL**: Banco de dados relacional.
- **Passport**: Autenticação local com email e senha.
- **Express-session**: Gerenciamento de sessões.
- **Multer**: Upload de imagens.
- **Socket.IO**: Notificações em tempo real.
- **Nodemailer**: Envio de emails (reset de senha, alertas de manutenção).
- **EJS**: Renderização das views.
- **Bootstrap 5**: Layout responsivo e componentes.

---

## Funcionalidades

### Para Usuários Comuns

- **Login/Logout**: Entrar e sair usando email e senha.
- **Recuperação de Senha**: Solicitar e resetar via email.
- **Perfil**: Visualizar informações próprias e histórico de uso.
- **Uso de Veículos**:
  1. Iniciar Uso: informa motorista e km inicial.
  2. Finalizar Uso: adiciona km final, fecha uso e envia foto do odômetro.
- **Relatório de Uso**: Consulta paginada, com detalhes de multas e distâncias.

### Para Administradores

- **Registro de Veículos**: Adicionar, editar e remover veículos.
- **Gerenciamento de Usos & Multas**: Editar/excluir registros de uso e infrações.
- **Manutenção Preventiva**:
  - Alertas quando veículo atinge limite de km (ex.: troca de óleo).
  - Marcar manutenção como realizada.
- **Controle Total**: Acesso a todos relatórios, telas e configurações.

### Funcionalidades Extras

- **Notificações Reativas**: Sistema monitora km e dispara alertas em tempo real via Socket.IO.
- **Atualização de Localização via GPS**: Rota para receber latitude/longitude com CORS configurado.
- **Comunicação em Tempo Real**: Notificações instantâneas sem reload.

---

## Como Executar

1. Clone o repositório:
   ```bash
   git clone URL_DO_REPO.git
   cd nome-do-projeto
   ```
2. Instale dependências:
   ```bash
   npm install
   ```
3. Configure variáveis de ambiente no `.env`:
   ```env
   DB_HOST=localhost
   DB_USER=usuario
   DB_PASS=senha
   DB_NAME=nome_db
   SESSION_SECRET=seusegredo
   EMAIL_USER=seu@email.com
   EMAIL_PASS=senha_email
   ```
4. Inicie o banco de dados (MySQL) e garanta que as tabelas existam.
5. Rode o servidor:
   ```bash
   npm start
   ```
6. Acesse em `http://localhost:3000`.

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

1. Abra o navegador e acesse `https://frota.inova.in`.
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
