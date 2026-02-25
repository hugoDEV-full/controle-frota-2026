const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function seedDatabase() {
  console.log('🌱 Iniciando carga inicial do banco...');
  
  // Debug: mostrar variáveis disponíveis
  console.log('🔍 Variáveis de ambiente disponíveis:');
  console.log('  MYSQLURL:', process.env.MYSQLURL ? '✅' : '❌');
  console.log('  MYSQL_URL:', process.env.MYSQL_URL ? '✅' : '❌');
  console.log('  MYSQL_PUBLIC_URL:', process.env.MYSQL_PUBLIC_URL ? '✅' : '❌');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅' : '❌');
  console.log('🔍 Variáveis individuais:');
  console.log('  DB_HOST:', process.env.DB_HOST || '❌ não definido');
  console.log('  DB_USER:', process.env.DB_USER || '❌ não definido');
  console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '✅' : '❌ não definido');
  console.log('  MYSQLHOST:', process.env.MYSQLHOST || '❌ não definido');
  console.log('  MYSQLPORT:', process.env.MYSQLPORT || '❌ não definido');
  console.log('  MYSQLUSER:', process.env.MYSQLUSER || '❌ não definido');
  console.log('  MYSQLPASSWORD:', process.env.MYSQLPASSWORD ? '✅' : '❌ não definido');
  console.log('  MYSQLDATABASE:', process.env.MYSQLDATABASE || '❌ não definido');
  
  // Railway pode fornecer URL(s) e/ou variáveis individuais.
  // Aceita também MYSQL_URL (padrão do Railway) e monta URL a partir de MYSQLHOST/etc.
  const mysqlUrl =
    process.env.MYSQLURL ||
    process.env.MYSQL_URL ||
    process.env.MYSQL_PUBLIC_URL ||
    process.env.DATABASE_URL;
  
  let connection;
  if (mysqlUrl) {
    const urlVar = process.env.MYSQLURL
      ? 'MYSQLURL'
      : process.env.MYSQL_URL
        ? 'MYSQL_URL'
        : process.env.MYSQL_PUBLIC_URL
          ? 'MYSQL_PUBLIC_URL'
          : 'DATABASE_URL';
    console.log(`🔗 Usando ${urlVar}...`);
    // Parse da URL do Railway: mysql://user:password@host:port/database
    const url = new URL(mysqlUrl);
    connection = await mysql.createConnection({
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1), // Remove o '/' inicial
      multipleStatements: true
    });
  } else {
    // Fallback para variáveis individuais (Railway: MYSQLHOST/MYSQLUSER/... ou DB_*)
    console.log('🔧 Usando variáveis individuais...');

    const host = process.env.DB_HOST || process.env.MYSQLHOST;
    const port = process.env.DB_PORT || process.env.MYSQLPORT;
    const user = process.env.DB_USER || process.env.MYSQLUSER;
    const password = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD;
    const database = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE;

    if (!host || !user || !password || !database) {
      throw new Error(
        'Variáveis do banco não configuradas. Defina MYSQL_URL/MYSQL_PUBLIC_URL (recomendado) ou DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (ou MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE).'
      );
    }

    connection = await mysql.createConnection({
      host,
      port: port || 3306,
      user,
      password,
      database,
      multipleStatements: true
    });
  }

  try {
    // 0) Criar tabelas se não existirem
    console.log('📋 Criando tabelas do banco...');
    
    // Tabela usuarios
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela veículos (já existe, vai adicionar colunas depois)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS veiculos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        placa VARCHAR(20) NOT NULL UNIQUE,
        nome VARCHAR(255) NOT NULL,
        modelo VARCHAR(255),
        marca VARCHAR(255),
        ano INT,
        cor VARCHAR(100),
        tipo VARCHAR(100),
        capacidade INT,
        status ENUM('Ativo', 'Manutenção', 'Inativo') DEFAULT 'Ativo',
        device_id VARCHAR(100),
        dispositivo VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela uso_veiculos
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS uso_veiculos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        veiculo_id INT NOT NULL,
        motorista VARCHAR(255) NOT NULL,
        km_inicial INT NOT NULL,
        km_final INT,
        data_hora_inicial TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_hora_final TIMESTAMP NULL,
        foto_km VARCHAR(255),
        finalidade TEXT,
        descricao TEXT,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        start_lat DECIMAL(10, 7),
        start_lng DECIMAL(10, 7),
        end_lat DECIMAL(10, 7),
        end_lng DECIMAL(10, 7),
        FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
      )
    `);
    
    // Tabela multas
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS multas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uso_id INT,
        veiculo_id INT NOT NULL,
        multa TEXT NOT NULL,
        data DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
        FOREIGN KEY (uso_id) REFERENCES uso_veiculos(id)
      )
    `);
    
    // Tabela motoristas
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS motoristas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        cpf VARCHAR(20) UNIQUE NOT NULL,
        cnh VARCHAR(50) NOT NULL,
        data_validade DATE NOT NULL,
        categoria VARCHAR(10) NOT NULL,
        foto_cnh LONGBLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela manutencoes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS manutencoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        veiculo_id INT NOT NULL,
        data_agendada DATE,
        tipo VARCHAR(255) NOT NULL,
        custo DECIMAL(10,2),
        status ENUM('Pendente', 'Concluída', 'Cancelada') DEFAULT 'Pendente',
        descricao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
      )
    `);
    
    // Tabela auditoria
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(255) NOT NULL,
        rota TEXT NOT NULL,
        metodo VARCHAR(10) NOT NULL,
        detalhes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela carro_reparo
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS carro_reparo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        marca VARCHAR(255),
        marca_nome VARCHAR(255),
        modelo VARCHAR(255),
        modelo_nome VARCHAR(255),
        ano INT,
        valor_fipe DECIMAL(10,2),
        custo_conserto DECIMAL(10,2),
        conserto_viavel ENUM('Sim', 'Não') DEFAULT 'Não',
        dataCadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela notificacoes
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mensagem TEXT NOT NULL,
        tipo VARCHAR(50) DEFAULT 'info',
        lida BOOLEAN DEFAULT FALSE,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario_id INT,
        user_id INT
      )
    `);

    // Tabela gps_history (GPS no mesmo banco)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS gps_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fk_device VARCHAR(100) NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        datahora_recebido TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_gps_device_time (fk_device, datahora_recebido)
      )
    `);

    // Tabela devices
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS devices (
        dev_id VARCHAR(100) PRIMARY KEY,
        dev_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela abastecimentos
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS abastecimentos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data_hora DATETIME NOT NULL,
        placa VARCHAR(20) NOT NULL,
        posto VARCHAR(255),
        tipo_combustivel VARCHAR(100),
        litros DECIMAL(10,2),
        preco_litro DECIMAL(10,2),
        preco_total DECIMAL(10,2),
        km_atual INT,
        condutor VARCHAR(255),
        criado_por VARCHAR(255),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        veiculo_id INT,
        FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
      )
    `);

    // Tabela geofences
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS geofences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        geom POLYGON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Tabelas criadas com sucesso!');
    
    // Adicionar colunas que podem faltar em tabelas existentes
    console.log('🔧 Verificando colunas que faltam...');
    
    // Adicionar colunas que faltam em veiculos
    try {
      await connection.execute(`ALTER TABLE veiculos ADD COLUMN device_id VARCHAR(100)`);
      console.log('✅ Coluna device_id adicionada à tabela veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna device_id já existe em veiculos');
      }
    }
    
    try {
      await connection.execute(`ALTER TABLE veiculos ADD COLUMN marca VARCHAR(255)`);
      console.log('✅ Coluna marca adicionada à tabela veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna marca já existe em veiculos');
      }
    }
    
    try {
      await connection.execute(`ALTER TABLE veiculos ADD COLUMN dispositivo VARCHAR(100)`);
      console.log('✅ Coluna dispositivo adicionada à tabela veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna dispositivo já existe em veiculos');
      }
    }
    
    // Adicionar colunas que faltam em uso_veiculos
    try {
      await connection.execute(`ALTER TABLE uso_veiculos ADD COLUMN start_lat DECIMAL(10, 7)`);
      console.log('✅ Coluna start_lat adicionada à tabela uso_veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna start_lat já existe em uso_veiculos');
      }
    }
    
    try {
      await connection.execute(`ALTER TABLE uso_veiculos ADD COLUMN start_lng DECIMAL(10, 7)`);
      console.log('✅ Coluna start_lng adicionada à tabela uso_veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna start_lng já existe em uso_veiculos');
      }
    }
    
    try {
      await connection.execute(`ALTER TABLE uso_veiculos ADD COLUMN end_lat DECIMAL(10, 7)`);
      console.log('✅ Coluna end_lat adicionada à tabela uso_veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna end_lat já existe em uso_veiculos');
      }
    }
    
    try {
      await connection.execute(`ALTER TABLE uso_veiculos ADD COLUMN end_lng DECIMAL(10, 7)`);
      console.log('✅ Coluna end_lng adicionada à tabela uso_veiculos');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna end_lng já existe em uso_veiculos');
      }
    }
    
    // Adicionar user_id na tabela notificacoes se não existir
    try {
      await connection.execute(`ALTER TABLE notificacoes ADD COLUMN user_id INT`);
      console.log('✅ Coluna user_id adicionada à tabela notificacoes');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna user_id já existe em notificacoes');
      }
    }
    
    // Adicionar criado_em na tabela auditoria se não existir
    try {
      await connection.execute(`ALTER TABLE auditoria ADD COLUMN criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      console.log('✅ Coluna criado_em adicionada à tabela auditoria');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna criado_em já existe em auditoria');
      }
    }
    
    // 1) Criar usuário admin com bcrypt
    console.log('👤 Criando usuários admin...');
    const hashedPassword = await bcrypt.hash('Hugo2026*', 10);
    const hashedPasswordAdmin = await bcrypt.hash('Hugo2026*', 10);
    const hashedPasswordUser = await bcrypt.hash('Hugo2026*', 10);
    
    // Primeiro, remove usuários existentes para evitar conflitos
    await connection.execute("DELETE FROM usuarios WHERE email IN ('hugo.leonardo.jobs@gmail.com', 'admin@frota.com', 'usuario@frota.com')");
    
    // Insere múltiplos usuários admin
    await connection.execute(`
      INSERT INTO usuarios (nome, email, senha, role, created_at) 
      VALUES ('Hugo Leonardo', 'hugo.leonardo.jobs@gmail.com', ?, 'admin', NOW())
    `, [hashedPassword]);
    
    await connection.execute(`
      INSERT INTO usuarios (nome, email, senha, role, created_at) 
      VALUES ('Admin Sistema', 'admin@frota.com', ?, 'admin', NOW())
    `, [hashedPasswordAdmin]);
    
    await connection.execute(`
      INSERT INTO usuarios (nome, email, senha, role, created_at) 
      VALUES ('Usuario Teste', 'usuario@frota.com', ?, 'user', NOW())
    `, [hashedPasswordUser]);
    
    console.log('✅ Usuários criados:');
    console.log('   - hugo.leonardo.jobs@gmail.com / Hugo2026* (admin)');
    console.log('   - admin@frota.com / Hugo2026* (admin)');
    console.log('   - usuario@frota.com / Hugo2026* (user)');

    // 2) Inserir veículos de exemplo
    console.log('🚗 Inserindo veículos de exemplo...');
    const veiculos = [
      ['Fiesta', 'ABC-1234', 2020, 45000, 35000, 'DEVICE001', 'Ford', 'DISP001'],
      ['Onix', 'DEF-5678', 2021, 32000, 22000, 'DEVICE002', 'Chevrolet', 'DISP002'],
      ['Palio', 'GHI-9012', 2019, 58000, 48000, 'DEVICE003', 'Fiat', 'DISP003'],
      ['Corolla', 'JKL-3456', 2022, 15000, 5000, 'DEVICE004', 'Toyota', 'DISP004'],
      ['HB20', 'MNO-7890', 2020, 42000, 32000, 'DEVICE005', 'Hyundai', 'DISP005']
    ];

    for (const [nome, placa, ano, km, ultimaTrocaOleo, device_id, marca, dispositivo] of veiculos) {
      await connection.execute(`
        INSERT INTO veiculos (nome, placa, ano, km, ultimaTrocaOleo, device_id, marca, dispositivo, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          nome = VALUES(nome), 
          ano = VALUES(ano), 
          km = VALUES(km), 
          ultimaTrocaOleo = VALUES(ultimaTrocaOleo),
          device_id = COALESCE(VALUES(device_id), device_id),
          marca = COALESCE(VALUES(marca), marca),
          dispositivo = COALESCE(VALUES(dispositivo), dispositivo)
      `, [nome, placa, ano, km, ultimaTrocaOleo, device_id, marca, dispositivo]);
    }
    
    // Atualizar veículos existentes sem device_id
    await connection.execute(`
      UPDATE veiculos 
      SET device_id = CONCAT('DEVICE', LPAD(id, 3, '0')) 
      WHERE device_id IS NULL OR device_id = ''
    `);
    
    // Atualizar veículos existentes sem marca
    await connection.execute(`
      UPDATE veiculos 
      SET marca = 'Sem Marca' 
      WHERE marca IS NULL OR marca = ''
    `);
    
    // Atualizar veículos existentes sem device_id
    await connection.execute(`
      UPDATE veiculos 
      SET device_id = CONCAT('DEVICE', LPAD(id, 3, '0')) 
      WHERE device_id IS NULL OR device_id = ''
    `);

    // 3) Inserir motoristas de exemplo
    console.log('👨‍✈️ Inserindo motoristas de exemplo...');
    const motoristas = [
      ['João Silva', 'joao.silva@email.com', '123.456.789-00', 'CNH123456', '2025-12-31', 'B', null],
      ['Maria Santos', 'maria.santos@email.com', '987.654.321-00', 'CNH654321', '2024-06-30', 'C', null],
      ['Carlos Oliveira', 'carlos.oliveira@email.com', '456.789.123-00', 'CNH789123', '2025-08-15', 'AB', null],
      ['Ana Costa', 'ana.costa@email.com', '789.123.456-00', 'CNH321654', '2026-01-20', 'D', null],
      ['Pedro Lima', 'pedro.lima@email.com', '321.654.987-00', 'CNH987321', '2024-11-10', 'B', null]
    ];

    for (const [nome, email, cpf, cnh, validade, categoria, foto_cnh] of motoristas) {
      await connection.execute(`
        INSERT INTO motoristas (nome, email, cpf, cnh, data_validade, categoria, foto_cnh, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          nome = VALUES(nome), 
          email = VALUES(email),
          data_validade = VALUES(data_validade), 
          categoria = VALUES(categoria)
      `, [nome, email, cpf, cnh, validade, categoria, foto_cnh]);
    }

    // 4) Inserir alguns registros de uso de exemplo
    console.log('📊 Inserindo registros de uso...');
    const usos = [
      [1, 'João Silva', '2024-01-15 08:00:00', '2024-01-15 18:00:00', 45000, 45250, 'Trabalho'],
      [2, 'Maria Santos', '2024-01-16 09:00:00', '2024-01-16 17:30:00', 32000, 32180, 'Trabalho'],
      [3, 'Carlos Oliveira', '2024-01-17 07:30:00', '2024-01-17 19:00:00', 58000, 58320, 'Pessoal'],
      [1, 'João Silva', '2024-01-18 08:15:00', '2024-01-18 17:45:00', 45250, 45480, 'Trabalho'],
      [4, 'Ana Costa', '2024-01-19 10:00:00', '2024-01-19 16:00:00', 15000, 15120, 'Trabalho']
    ];

    for (const [veiculo_id, motorista, data_hora_inicial, data_hora_final, km_inicial, km_final, finalidade] of usos) {
      await connection.execute(`
        INSERT INTO uso_veiculos 
        (veiculo_id, motorista, data_hora_inicial, data_hora_final, km_inicial, km_final, finalidade, data_criacao) 
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [veiculo_id, motorista, data_hora_inicial, data_hora_final, km_inicial, km_final, finalidade]);
    }

    // 5) Inserir multas - VERSAO FINAL CORRIGIDA
    console.log('🚨 Inserindo multas de exemplo...');
    
    // Inserir multas vinculadas aos usos existentes
    await connection.execute(`
      INSERT INTO multas (uso_id, veiculo_id, data, multa, created_at) 
      VALUES (1, 1, '2024-01-15', 'Estacionar em local proibido', NOW())
    `);
    
    await connection.execute(`
      INSERT INTO multas (uso_id, veiculo_id, data, multa, created_at) 
      VALUES (2, 2, '2024-01-16', 'Excesso de velocidade', NOW())
    `);
    
    await connection.execute(`
      INSERT INTO multas (uso_id, veiculo_id, data, multa, created_at) 
      VALUES (3, 3, '2024-01-17', 'Avançar sinal vermelho', NOW())
    `);
    
    // 6) Inserir geofences de exemplo
    console.log('🗺️ Inserindo geofences de exemplo...');
    await connection.execute(`
      INSERT INTO geofences (nome, geom, created_at) 
      VALUES ('Sede Empresa', ST_GeomFromText('POLYGON((-46.654 -23.549, -46.652 -23.549, -46.652 -23.547, -46.654 -23.547, -46.654 -23.549))'), NOW())
    `);
    
    await connection.execute(`
      INSERT INTO geofences (nome, geom, created_at) 
      VALUES ('Área de Estacionamento', ST_GeomFromText('POLYGON((-46.650 -23.550, -46.648 -23.550, -46.648 -23.548, -46.650 -23.548, -46.650 -23.550))'), NOW())
    `);
    
    // Inserir dados de exemplo na tabela devices
    console.log('📱 Inserindo devices de exemplo...');
    await connection.execute(`INSERT IGNORE INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE001', 'Device Fiesta', NOW())`);
    await connection.execute(`INSERT IGNORE INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE002', 'Device Onix', NOW())`);
    await connection.execute(`INSERT IGNORE INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE003', 'Device Palio', NOW())`);
    await connection.execute(`INSERT IGNORE INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE004', 'Device Corolla', NOW())`);
    await connection.execute(`INSERT IGNORE INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE005', 'Device HB20', NOW())`);
    
    // Inserir dados de exemplo na tabela abastecimentos
    console.log('⛽ Inserindo abastecimentos de exemplo...');
    const abastecimentos = [
      {
        data_hora: '2024-01-15 18:00:00',
        placa: 'ABC-1234',
        posto: 'Posto Shell Centro',
        tipo_combustivel: 'Gasolina',
        litros: 45.50,
        preco_litro: 5.89,
        preco_total: 267.90,
        km_atual: 45050,
        condutor: 'João Silva',
        criado_por: 'admin',
        veiculo_id: 1
      },
      {
        data_hora: '2024-01-16 19:00:00',
        placa: 'DEF-5678',
        posto: 'Posto Ipiranga Norte',
        tipo_combustivel: 'Etanol',
        litros: 38.20,
        preco_litro: 4.75,
        preco_total: 181.45,
        km_atual: 32075,
        condutor: 'Maria Santos',
        criado_por: 'admin',
        veiculo_id: 2
      },
      {
        data_hora: '2024-01-17 17:00:00',
        placa: 'GHI-9012',
        posto: 'Posto Petrobras Sul',
        tipo_combustivel: 'Diesel',
        litros: 52.80,
        preco_litro: 5.45,
        preco_total: 287.76,
        km_atual: 58030,
        condutor: 'Carlos Oliveira',
        criado_por: 'admin',
        veiculo_id: 3
      }
    ];

    for (const abast of abastecimentos) {
      await connection.execute(`
        INSERT INTO abastecimentos (
          data_hora, placa, posto, tipo_combustivel, litros, preco_litro, 
          preco_total, km_atual, condutor, criado_por, veiculo_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        abast.data_hora, abast.placa, abast.posto, abast.tipo_combustivel,
        abast.litros, abast.preco_litro, abast.preco_total, abast.km_atual,
        abast.condutor, abast.criado_por, abast.veiculo_id
      ]);
    }
    
    // Inserir dados de uso com coordenadas GPS simuladas
    console.log('🚗 Inserindo usos com coordenadas GPS...');
    const usosComCoordenadas = [
      {
        veiculo_id: 1,
        motorista: 'João Silva',
        km_inicial: 45000,
        km_final: 45050,
        data_hora_inicial: '2024-01-15 08:00:00',
        data_hora_final: '2024-01-15 17:30:00',
        finalidade: 'Visita ao cliente',
        descricao: 'Reunião de apresentação',
        start_lat: -23.5505,
        start_lng: -46.6333,
        end_lat: -23.5605,
        end_lng: -46.6433
      },
      {
        veiculo_id: 2,
        motorista: 'Maria Santos',
        km_inicial: 32000,
        km_final: 32075,
        data_hora_inicial: '2024-01-16 09:15:00',
        data_hora_final: '2024-01-16 18:45:00',
        finalidade: 'Entrega de material',
        descricao: 'Entrega de documentos',
        start_lat: -23.5480,
        start_lng: -46.6310,
        end_lat: -23.5580,
        end_lng: -46.6410
      },
      {
        veiculo_id: 3,
        motorista: 'Carlos Oliveira',
        km_inicial: 58000,
        km_final: 58030,
        data_hora_inicial: '2024-01-17 07:30:00',
        data_hora_final: '2024-01-17 16:00:00',
        finalidade: 'Manutenção programada',
        descricao: 'Levar para oficina',
        start_lat: -23.5520,
        start_lng: -46.6340,
        end_lat: -23.5620,
        end_lng: -46.6440
      },
      {
        veiculo_id: 4,
        motorista: 'Ana Costa',
        km_inicial: 15000,
        km_final: 15025,
        data_hora_inicial: '2024-01-18 10:00:00',
        data_hora_final: '2024-01-18 14:30:00',
        finalidade: 'Reunião externa',
        descricao: 'Reunião com fornecedor',
        start_lat: -23.5490,
        start_lng: -46.6320,
        end_lat: -23.5590,
        end_lng: -46.6420
      },
      {
        veiculo_id: 5,
        motorista: 'Pedro Lima',
        km_inicial: 42000,
        km_final: 42060,
        data_hora_inicial: '2024-01-19 08:45:00',
        data_hora_final: '2024-01-19 17:15:00',
        finalidade: 'Serviço de campo',
        descricao: 'Instalação no cliente',
        start_lat: -23.5510,
        start_lng: -46.6330,
        end_lat: -23.5610,
        end_lng: -46.6430
      }
    ];

    for (const uso of usosComCoordenadas) {
      await connection.execute(`
        INSERT INTO uso_veiculos (
          veiculo_id, motorista, km_inicial, km_final, 
          data_hora_inicial, data_hora_final, finalidade, descricao,
          start_lat, start_lng, end_lat, end_lng, data_criacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        uso.veiculo_id, uso.motorista, uso.km_inicial, uso.km_final,
        uso.data_hora_inicial, uso.data_hora_final, uso.finalidade, uso.descricao,
        uso.start_lat, uso.start_lng, uso.end_lat, uso.end_lng
      ]);
    }

    // Inserir MASSIVA quantidade de dados GPS (2025-2030 - 5 ANOS)
    console.log('📍 Inserindo MASSIVA quantidade de dados GPS history (2025-2030 - 5 ANOS)...');
    
    // Função para gerar coordenadas entre dois pontos
    function generateRoute(startLat, startLng, endLat, endLng, steps, startTime, intervalMinutes) {
      const route = [];
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const lat = startLat + (endLat - startLat) * progress;
        const lng = startLng + (endLng - startLng) * progress;
        const time = new Date(startTime.getTime() + i * intervalMinutes * 60000);
        route.push({
          lat: lat + (Math.random() - 0.5) * 0.001, // Pequena variação
          lng: lng + (Math.random() - 0.5) * 0.001,
          time: time.toISOString().slice(0, 19).replace('T', ' ')
        });
      }
      return route;
    }

    // Função para gerar destinos aleatórios em São Paulo
    function generateRandomDestination(baseLat, baseLng) {
      const destinations = [
        { lat: -23.5505, lng: -46.6333, name: "Centro" },
        { lat: -23.5614, lng: -46.6559, name: "Pinheiros" },
        { lat: -23.5689, lng: -46.6848, name: "Vila Madalena" },
        { lat: -23.5874, lng: -46.6576, name: "Itaim Bibi" },
        { lat: -23.5980, lng: -46.6771, name: "Moema" },
        { lat: -23.6229, lng: -46.6963, name: "Ibirapuera" },
        { lat: -23.5020, lng: -46.6090, name: "Tatuapé" },
        { lat: -23.5436, lng: -46.5920, name: "Bela Vista" },
        { lat: -23.5713, lng: -46.6427, name: "Consolação" },
        { lat: -23.5329, lng: -46.6395, name: "Sé" },
        { lat: -23.5488, lng: -46.6388, name: "República" },
        { lat: -23.5630, lng: -46.6529, name: "Jardins" },
        { lat: -23.5899, lng: -46.6815, name: "Chácara Santo Antônio" },
        { lat: -23.6185, lng: -46.7040, name: "Brooklin" },
        { lat: -23.5330, lng: -46.6250, name: "Brás" }
      ];
      
      return destinations[Math.floor(Math.random() * destinations.length)];
    }

    // Gerar dados para 5 anos (2025-2030)
    const allMassiveRoutes = [];
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2030-12-31');
    
    // Rotas base para cada veículo
    const baseRoutes = [
      { device: 'DEVICE001', name: 'Fiesta', baseLat: -23.5505, baseLng: -46.6333 },
      { device: 'DEVICE002', name: 'Onix', baseLat: -23.5480, baseLng: -46.6310 },
      { device: 'DEVICE003', name: 'Palio', baseLat: -23.5520, baseLng: -46.6340 },
      { device: 'DEVICE004', name: 'Corolla', baseLat: -23.5490, baseLng: -46.6320 },
      { device: 'DEVICE005', name: 'HB20', baseLat: -23.5510, baseLng: -46.6330 }
    ];

    // Calcular dias totais
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    console.log(`📍 Gerando dados para ${totalDays} dias (${totalDays/365:.1f} anos)...`);

    let totalPoints = 0;

    // Gerar dados para cada dia
    for (let day = 0; day < totalDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);
      
      // Pular alguns dias aleatoriamente para simular dias sem uso
      if (Math.random() < 0.1) continue; // 10% dos dias sem uso
      
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      for (const route of baseRoutes) {
        // Simular padrões de uso diferentes para cada dia
        const usagePattern = Math.random();
        
        if (isWeekend) {
          // Fim de semana: uso mais esporádico e horários diferentes
          if (usagePattern < 0.3) {
            // 30% de chance de uso no fim de semana
            const weekendStart = new Date(currentDate);
            weekendStart.setHours(9 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
            
            const destination = generateRandomDestination(route.baseLat, route.baseLng);
            const weekendRoute = generateRoute(
              route.baseLat, route.baseLng,
              destination.lat, destination.lng,
              40 + Math.floor(Math.random() * 40), // 40-80 pontos
              weekendStart,
              3 + Math.random() * 2 // 3-5 minutos entre pontos
            );
            
            allMassiveRoutes.push(...weekendRoute.map(p => ({
              fk_device: route.device,
              latitude: p.lat,
              longitude: p.lng,
              datahora_recebido: p.time
            })));
            
            totalPoints += weekendRoute.length;
          }
        } else {
          // Dia de semana: uso regular com horários de trabalho
          
          // Rota de ida (manhã)
          if (usagePattern < 0.8) { // 80% de chance de ir trabalhar
            const morningStart = new Date(currentDate);
            morningStart.setHours(7 + Math.floor(Math.random() * 1), 30 + Math.floor(Math.random() * 30), 0, 0);
            
            const destination = generateRandomDestination(route.baseLat, route.baseLng);
            const morningRoute = generateRoute(
              route.baseLat, route.baseLng,
              destination.lat, destination.lng,
              30 + Math.floor(Math.random() * 30), // 30-60 pontos
              morningStart,
              2 + Math.random() * 3 // 2-5 minutos entre pontos
            );
            
            allMassiveRoutes.push(...morningRoute.map(p => ({
              fk_device: route.device,
              latitude: p.lat,
              longitude: p.lng,
              datahora_recebido: p.time
            })));
            
            totalPoints += morningRoute.length;
          }
          
          // Rota de volta (tarde)
          if (usagePattern < 0.7) { // 70% de chance de voltar
            const afternoonStart = new Date(currentDate);
            afternoonStart.setHours(16 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
            
            const destination = generateRandomDestination(route.baseLat, route.baseLng);
            const afternoonRoute = generateRoute(
              destination.lat, destination.lng,
              route.baseLat, route.baseLng,
              30 + Math.floor(Math.random() * 30),
              afternoonStart,
              2 + Math.random() * 3
            );
            
            allMassiveRoutes.push(...afternoonRoute.map(p => ({
              fk_device: route.device,
              latitude: p.lat,
              longitude: p.lng,
              datahora_recebido: p.time
            })));
            
            totalPoints += afternoonRoute.length;
          }
          
          // Atividades extras durante o dia (20% de chance)
          if (Math.random() < 0.2) {
            const extraStart = new Date(currentDate);
            extraStart.setHours(12 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);
            
            const destination1 = generateRandomDestination(route.baseLat, route.baseLng);
            const destination2 = generateRandomDestination(route.baseLat, route.baseLng);
            
            const extraRoute = generateRoute(
              destination1.lat, destination1.lng,
              destination2.lat, destination2.lng,
              20 + Math.floor(Math.random() * 20),
              extraStart,
              1 + Math.random() * 2
            );
            
            allMassiveRoutes.push(...extraRoute.map(p => ({
              fk_device: route.device,
              latitude: p.lat,
              longitude: p.lng,
              datahora_recebido: p.time
            })));
            
            totalPoints += extraRoute.length;
          }
        }
        
        // Adicionar pontos aleatórios durante o dia (simulando paradas)
        if (Math.random() < 0.3) {
          for (let hour = 10; hour <= 20; hour += 2) {
            if (Math.random() < 0.1) {
              const randomTime = new Date(currentDate);
              randomTime.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
              
              const randomLat = route.baseLat + (Math.random() - 0.5) * 0.03;
              const randomLng = route.baseLng + (Math.random() - 0.5) * 0.03;
              
              allMassiveRoutes.push({
                fk_device: route.device,
                latitude: randomLat,
                longitude: randomLng,
                datahora_recebido: randomTime.toISOString().slice(0, 19).replace('T', ' ')
              });
              
              totalPoints++;
            }
          }
        }
      }
      
      // Progresso a cada 100 dias
      if (day % 100 === 0) {
        console.log(`   Progresso: ${day}/${totalDays} dias (${(day/totalDays*100).toFixed(1)}%) - ${totalPoints} pontos gerados...`);
      }
    }

    // Ordenar por data
    allMassiveRoutes.sort((a, b) => new Date(a.datahora_recebido) - new Date(b.datahora_recebido));

    console.log(`📍 Total gerado: ${allMassiveRoutes.length.toLocaleString('pt-BR')} pontos GPS de 2025-2030`);
    console.log(`📍 Média: ${(allMassiveRoutes.length / totalDays).toFixed(0)} pontos por dia`);
    console.log(`📍 Inserindo pontos no banco de dados...`);
    
    // Inserir em lotes para melhor performance
    const batchSize = 500; // Lotes maiores para melhor performance
    let insertedCount = 0;
    
    for (let i = 0; i < allMassiveRoutes.length; i += batchSize) {
      const batch = allMassiveRoutes.slice(i, i + batchSize);
      const values = batch.map(gps => [gps.fk_device, gps.latitude, gps.longitude, gps.datahora_recebido]);
      
      try {
        await connection.execute(`
          INSERT INTO gps_history (fk_device, latitude, longitude, datahora_recebido)
          VALUES ${values.map(() => '(?, ?, ?, ?)').join(',')}
        `, values.flat());
        
        insertedCount += batch.length;
        
        // Progresso a cada 10.000 pontos
        if (insertedCount % 10000 === 0) {
          console.log(`   Inseridos: ${insertedCount.toLocaleString('pt-BR')}/${allMassiveRoutes.length.toLocaleString('pt-BR')} pontos (${(insertedCount/allMassiveRoutes.length*100).toFixed(1)}%)`);
        }
      } catch (error) {
        console.error(`Erro ao inserir lote ${i}-${i+batchSize}:`, error.message);
        // Continuar mesmo com erro no lote
      }
    }
    
    console.log(`✅ Inserção concluída: ${insertedCount.toLocaleString('pt-BR')} pontos GPS de 2025-2030`);
    
    console.log('✅ Carga inicial concluída com sucesso!');
    
    // 7) Inserir manutenções de exemplo
    console.log('🔧 Inserindo manutenções de exemplo...');
    const manutencoes = [
      [1, '2024-01-20', 'Troca de óleo', 150.00, 'Concluída', 'Troca de óleo e filtro'],
      [2, '2024-01-25', 'Revisão geral', 500.00, 'Pendente', 'Revisão dos 40.000 km'],
      [3, '2024-01-18', 'Alinhamento e balanceamento', 120.00, 'Concluída', 'Alinhamento direção e balanceamento']
    ];

    for (const [veiculo_id, data_agendada, tipo, custo, status, descricao] of manutencoes) {
      await connection.execute(`
        INSERT INTO manutencoes 
        (veiculo_id, data_agendada, tipo, custo, status, descricao, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `, [veiculo_id, data_agendada, tipo, custo, status, descricao]);
    }

    console.log('✅ Carga inicial concluída com sucesso!');
    console.log('👤 Usuário admin: hugo.leonardo.jobs@gmail.com / Bento1617@');
    console.log('🚗 5 veículos inseridos');
    console.log('👨‍✈️ 5 motoristas inseridos');
    console.log('📊 5 registros de uso inseridos');
    console.log('🚨 3 multas inseridas');
    console.log('🔧 3 manutenções inseridas');

  } catch (err) {
    console.error('❌ Erro na carga inicial:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
