# Funcionalidades feitas até 26/03/2025

# 1. Autenticação, Sessões e Recuperação de Senha

## 1.1 Tela de Login (/login GET & POST)
- Exibe a página de login (com um layout específico) e realiza a autenticação por meio do Passport.
- **Validação:** Verifica se o e-mail e a senha correspondem a um usuário cadastrado.

## 1.2 Logout (/logout GET)
- Finaliza a sessão do usuário, apaga os dados da sessão e redireciona para a página de login.

## 1.3 Recuperação de Senha (/forgot-password & /reset-password/:token)
- Permite que o usuário solicite a redefinição da senha. Gera um token de recuperação com prazo de validade e envia um e-mail com as instruções.
- **Validação:** Confirma se o token fornecido é válido e ainda está dentro do prazo de expiração antes de permitir a alteração da senha.

---

# 2. Dashboard e Notificações

## 2.1 Dashboard (/ GET)
- Apresenta um painel com informações resumidas, como:
  - Lista de veículos cadastrados.
  - Contagem de veículos, multas, registros de uso e motoristas ativos (obtidos por meio de consultas encadeadas para garantir que os números estejam corretos).

## 2.2 Notificações (/notificacoes GET)
- Exibe alertas importantes, como a necessidade de troca de óleo de veículos quando a diferença entre o km atual e a última troca atinge ou ultrapassa 10.000 km.
- **Integração:** As notificações são enviadas por e-mail e também são exibidas em tempo real via Socket.IO.

---

# 3. Gerenciamento de Veículos

## 3.1 Registro de Veículo (/registrar-veiculo GET & POST)
- Permite o cadastro de novos veículos, exigindo o preenchimento de campos obrigatórios como nome, placa, quilometragem, última troca de óleo e modelo.
- **Validação:** Verifica se todos os campos obrigatórios foram preenchidos.

## 3.2 Edição de Veículo (/editar-veiculo/:id GET & POST)
- Permite a atualização dos dados de um veículo existente, garantindo que o veículo realmente esteja cadastrado.
- Um veículo pode ter o km alterado se não houver nenhum uso em andamento pra ele. 
- Após a alteração do km do veículo, o km inicial do próximo uso será automaticamente atualizado com o valor km atual do veículo.

## 3.3 Exclusão de Veículo (/excluir-veiculo/:id POST)
- Remove um veículo do sistema. Essa funcionalidade está restrita a administradores.

## 3.4 Troca de Óleo (/troca-feita/:id POST)
- Atualiza a última troca de óleo do veículo, utilizando o km atual como referência para indicar que a manutenção foi realizada.

---

# 4. Controle de Uso de Veículos

## 4.1 Formulário de Uso (/usar/:id GET)
- Exibe os detalhes do veículo e define o km inicial com base no último uso registrado. Se não houver registros anteriores, utiliza o km atual do veículo.

## 4.2 Registro de Uso (/usar/:id POST)
- Registra um novo uso do veículo com os seguintes controles:

### 4.2.1 Validação de Quilometragem
- Verifica se o km inicial informado corresponde ao km final do último uso ou ao km atual do veículo.
- Garante que o km final, quando informado, não seja menor que o km inicial.

### 4.2.2 Verificação de Sobreposição
- Consulta o banco de dados para identificar se já existe um uso cadastrado no mesmo período.
- Se houver, retorna um erro para evitar registros duplicados.

### 4.2.3 Atualização do Veículo
- Caso o km final seja informado, o sistema atualiza a quilometragem do veículo e executa uma verificação para determinar se a troca de óleo é necessária.

---

# 5. Edição de Uso e Gerenciamento de Multas

## 5.1 Edição de Uso (/editar-uso/:id GET & POST)
- Exibe um formulário para atualização dos dados de um uso (motorista, km final, data de término, foto, entre outros).

### Verificações na edição:
#### 5.1.1 Quilometragem  
- O km final informado não pode ser menor que o km inicial e não pode ultrapassar a autonomia estimada (por exemplo, 500 km para um tanque).

#### 5.1.2 Datas  
- O sistema verifica se a data de término informada não é anterior à data de início.

#### 5.1.3 Multas  
- Permite que multas já registradas sejam editadas e novas sejam adicionadas ao uso correspondente.

#### 5.1.4 Atualização do Veículo  
- Se a quilometragem for alterada, o veículo é atualizado e a verificação de troca de óleo é refeita.

## 5.2 Exclusão de Uso (/excluir-uso/:id POST & /excluir-multiplos-usos POST)
- Remove o registro de uso e todas as multas associadas. No caso de exclusões em lote, utiliza transações para garantir que todas as operações sejam executadas corretamente ou revertidas em caso de erro.

---

# 6. Registro e Gerenciamento de Multas

## 6.1 Registro de Multa (/registrar-multa/:veiculo_id GET & POST)

### GET:
- Exibe um formulário para registrar uma multa relacionada a um veículo específico.

### POST:
- Processa o registro da multa.

#### 6.1.1 Associação Automática  
- Busca no banco de dados um registro de uso do veículo que englobe o período da multa e vincula a infração ao motorista responsável.

#### 6.1.2 Verificação  
- Se não houver um uso correspondente, exibe uma mensagem informando que é necessário registrar um uso para aquele período.

## 6.2 Exclusão de Multa (/excluir-multa/:id POST)
- Permite que os administradores excluam multas registradas no sistema.

---

# 7. Relatórios e Consultas de Dados

## 7.1 Relatório de Uso (/relatorio-uso GET & /api/relatorio-uso GET)
- Apresenta os registros de uso do veículo, com opções de filtragem, ordenação e paginação dos dados.

## 7.2 Relatório de Multas (/relatorio-multas GET)
- Exibe todas as multas registradas, associando-as aos respectivos veículos e usos, ordenadas por data.

---

# 8. Notificações de Manutenção e Integração com Socket.IO

## 8.1 Verificação de Troca de Óleo
- O sistema verifica periodicamente se algum veículo já rodou mais de 10.000 km desde a última troca de óleo.
- **Ação:** Caso o limite seja atingido, o sistema envia uma notificação em tempo real via Socket.IO e também encaminha um e-mail para o responsável.

## 8.2 Notificações Gerais (/notificacoes GET)
- Apresenta a lista de veículos que necessitam de manutenção, permitindo que o usuário acompanhe os alertas mais importantes.

---

# 9. Upload e Gerenciamento de Arquivos

## 9.1 Configuração do Multer
- Define o local de armazenamento e os limites para o envio de arquivos de imagem, usados no registro de quilometragem dos veículos.
- **Validação:** Aceita apenas arquivos de imagem e dentro do tamanho permitido.

---


# 11. Consistência e Verificações Gerais

## 11.1 Validação de Períodos (Uso)
- O sistema verifica se não há sobreposição de períodos ao registrar um novo uso.

## 11.2 Validação de Km e Datas
- Garante que a quilometragem inicial e final sejam coerentes e que as datas de início e término do uso sejam válidas.

## 11.3 Transações em Exclusões Múltiplas
- Para exclusões em lote, o sistema utiliza transações para garantir integridade dos dados.

# 12. O sistema gerencia usuários, veículos, registros de uso, multas e relatórios, promove consistência e segurança dos dados, notificações em tempo real e por e-mail.

✅ Funcionalidades já feitas:
🔹 Gestão de Motoristas
Cadastro de motoristas (Nome, CPF, CNH, validade, categoria e foto).

Validação automática da CNH (verifica vencimento antes de permitir uso).

Registro de infrações para cada motorista.

Ranking de motoristas baseado no número de infrações.

Link do motorista com usuário logado.

Validação de CPF no cadastro de motoristas.

🔹 Relatórios e Estatísticas
Relatório de uso decrescente (registros exibidos em ordem decrescente).

Relatórios de estatísticas:

Motoristas que Podem Dirigir.

Motoristas que Não Podem Dirigir.

Veículos.

Multas.

Uso por Dia/Mês/Ano.

Multas por Mês/Ano/Motorista.

Motoristas em Atividade.

Pesquisa nas tabelas de dados (DataTables).

Tradução do DataTables.

🔹 Registro e Gestão de Uso
Preenchimento automático do campo “motorista” com o usuário logado.

Registro de uso em tempo real (tempo atualizado automaticamente).

Edição de data e hora final baseada no fuso horário UTC-3.

Atualização automática do KM inicial ao editar o veículo.

🔹 Multas e Notificações
Apenas administradores podem registrar multas.

Notificação com opção de apagar o registro.

🔹 Financeiro
Adicionar comprovante de abastecimento.

Informar o reembolso necessário ao administrador e ao usuário.

Reembolsos registrados.

🔹 Mapa e Localização (local com localizacao.html mandando localização e app.js recebendo e front end mostrando no mapa)
Integração de mapa para exibição da localização do veículo.

Registro de movimentação no mapa.
🔹 Melhorias no Front-end
Melhorar notificações de erro para edição e uso mais amigável ao usuário.

🔹 Relatórios adicionais
Adicionar relatório de consumo estimado de combustível por uso /  veículo.

🔹 Finalidade do uso (se pessoal ou a trabalho), em usar, editarUso e relatoriodeuso.
🔹 Estatistica tempo de uso, mes , dia, ano, motorista. ajuste scroll y de cards em dashboard .
🔹 Busca em: veiculos nome e placa, uso motorista, multas descrição da multa, motoristas nome e cpf.
🔹 RegrasManutencao = [
        { tipo: 'Troca de Pneus', kmIntervalo: 100 },
        { tipo: 'Rodízio de Pneus', kmIntervalo: 100 },
        { tipo: 'Troca de Pastilhas', kmIntervalo: 100 },
        { tipo: 'Troca de Discos de Freio', kmIntervalo: 100 },
        { tipo: 'Troca da Correia Dentada', kmIntervalo: 100 },
        { tipo: 'Troca do Óleo do Motor', kmIntervalo: 100 },
        { tipo: 'Troca do Filtro de Óleo', kmIntervalo: 100 },
        { tipo: 'Troca do Filtro de Ar', kmIntervalo: 100 },
        { tipo: 'Troca do Filtro de Combustível', kmIntervalo: 100 },
        { tipo: 'Alinhamento e Balanceamento', kmIntervalo: 100 },
        { tipo: 'Verificação do Sistema de Arrefecimento', kmIntervalo: 100 },
        { tipo: 'Revisão do Sistema Elétrico', kmIntervalo: 100 },
        { tipo: 'Inspeção dos Níveis (água, freio, etc.)', kmIntervalo: 100 },
        { tipo: 'Troca do Líquido de Arrefecimento', kmIntervalo: 100 },
        { tipo: 'Troca do Líquido de Freio', kmIntervalo: 100 },
        { tipo: 'Troca do Líquido da Direção Hidráulica', kmIntervalo: 100 },
        { tipo: 'Troca das Velas de Ignição', kmIntervalo: 100 },
        { tipo: 'Inspeção da Suspensão e Amortecedores', kmIntervalo: 100 },
        { tipo: 'Inspeção da Bateria', kmIntervalo: 100 },
        { tipo: 'Inspeção do Sistema de Escape', kmIntervalo: 100 },
        { tipo: 'Verificação dos Cabos e Correias', kmIntervalo: 100 }]
🔹Relatorio consumo com pesquisa por motorista e intervalo de datas, ano e cor adicionado a registrar e editar veiculo e ao banco
🔹 Outros
Manutenções pendentes registradas.
🔹 Revisão de senha forte e confirmação de senha.

Gráfico de reembolso

Validade da CNH exibida nos cards dos motoristas.
 
---

❌ Funcionalidades que ainda precisam ser feitas:


🔸 Localização
Aguardar Integração solução de localização feita pela equipe usando celular.



🔸 Gestão de Uso
Registro do local de partida e destino da viagem.



🔸 Revisão e Segurança
Revisão de rotas para segurança.

Revisão de rotas em relação ao papel do administrador.


