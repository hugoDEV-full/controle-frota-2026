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
    
    // Atualizar veículos existentes sem dispositivo
    await connection.execute(`
      UPDATE veiculos 
      SET dispositivo = CONCAT('DISP', LPAD(id, 3, '0')) 
      WHERE dispositivo IS NULL OR dispositivo = ''
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
    await connection.execute(`INSERT INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE001', 'Device Fiesta', NOW())`);
    await connection.execute(`INSERT INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE002', 'Device Onix', NOW())`);
    await connection.execute(`INSERT INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE003', 'Device Palio', NOW())`);
    await connection.execute(`INSERT INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE004', 'Device Corolla', NOW())`);
    await connection.execute(`INSERT INTO devices (dev_id, dev_name, created_at) VALUES ('DEVICE005', 'Device HB20', NOW())`);
    
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

    // Inserir dados simulados no GPS history
    console.log('📍 Inserindo dados de GPS history simulados...');
    const gpsData = [
      // DEVICE001 - Fiesta (percurso São Paulo)
      { fk_device: 'DEVICE001', latitude: -23.5505, longitude: -46.6333, datahora_recebido: '2024-01-15 08:00:00' },
      { fk_device: 'DEVICE001', latitude: -23.5510, longitude: -46.6340, datahora_recebido: '2024-01-15 09:00:00' },
      { fk_device: 'DEVICE001', latitude: -23.5520, longitude: -46.6350, datahora_recebido: '2024-01-15 10:00:00' },
      { fk_device: 'DEVICE001', latitude: -23.5580, longitude: -46.6400, datahora_recebido: '2024-01-15 14:00:00' },
      { fk_device: 'DEVICE001', latitude: -23.5605, longitude: -46.6433, datahora_recebido: '2024-01-15 17:30:00' },
      
      // DEVICE002 - Onix
      { fk_device: 'DEVICE002', latitude: -23.5480, longitude: -46.6310, datahora_recebido: '2024-01-16 09:15:00' },
      { fk_device: 'DEVICE002', latitude: -23.5500, longitude: -46.6330, datahora_recebido: '2024-01-16 12:00:00' },
      { fk_device: 'DEVICE002', latitude: -23.5550, longitude: -46.6380, datahora_recebido: '2024-01-16 15:00:00' },
      { fk_device: 'DEVICE002', latitude: -23.5580, longitude: -46.6410, datahora_recebido: '2024-01-16 18:45:00' },
      
      // DEVICE003 - Palio
      { fk_device: 'DEVICE003', latitude: -23.5520, longitude: -46.6340, datahora_recebido: '2024-01-17 07:30:00' },
      { fk_device: 'DEVICE003', latitude: -23.5570, longitude: -46.6390, datahora_recebido: '2024-01-17 11:00:00' },
      { fk_device: 'DEVICE003', latitude: -23.5620, longitude: -46.6440, datahora_recebido: '2024-01-17 16:00:00' },
      
      // DEVICE004 - Corolla
      { fk_device: 'DEVICE004', latitude: -23.5490, longitude: -46.6320, datahora_recebido: '2024-01-18 10:00:00' },
      { fk_device: 'DEVICE004', latitude: -23.5540, longitude: -46.6370, datahora_recebido: '2024-01-18 12:30:00' },
      { fk_device: 'DEVICE004', latitude: -23.5590, longitude: -46.6420, datahora_recebido: '2024-01-18 14:30:00' },
      
      // DEVICE005 - HB20
      { fk_device: 'DEVICE005', latitude: -23.5510, longitude: -46.6330, datahora_recebido: '2024-01-19 08:45:00' },
      { fk_device: 'DEVICE005', latitude: -23.5530, longitude: -46.6350, datahora_recebido: '2024-01-19 11:00:00' },
      { fk_device: 'DEVICE005', latitude: -23.5560, longitude: -46.6380, datahora_recebido: '2024-01-19 14:00:00' },
      { fk_device: 'DEVICE005', latitude: -23.5610, longitude: -46.6430, datahora_recebido: '2024-01-19 17:15:00' }
    ];

    for (const gps of gpsData) {
      await connection.execute(`
        INSERT INTO gps_history (fk_device, latitude, longitude, datahora_recebido)
        VALUES (?, ?, ?, ?)
      `, [gps.fk_device, gps.latitude, gps.longitude, gps.datahora_recebido]);
    }
    
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
