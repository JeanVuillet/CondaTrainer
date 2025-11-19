// init-db.js
// Ce script réinitialise la BDD avec la NOUVELLE structure (levels avec notes).
// À exécuter : node init-db.js

const mongoose = require('mongoose');
require('dotenv').config(); 

const mongoUri = process.env.MONGODB_URI;

// ==========================================================
// NOUVEAU SCHÉMA (AVEC NOTES A+, A, B, C)
// ==========================================================
const PlayerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  classroom: String,
  validatedQuestions: [String],
  // Modification majeure ici : validatedLevels est un tableau d'objets
  validatedLevels: [
    {
      levelId: { type: String, required: true },
      grade: { type: String, default: 'C' }, // La note obtenue
      date: { type: Date, default: Date.now }
    }
  ],
  created_at: { type: Date, default: Date.now },
});

const Player = mongoose.model('Player', PlayerSchema, 'players');

// Liste des élèves (On initialise avec des tableaux vides, la structure s'adaptera à l'insertion)
const players = [
    // === 6eD ===
    { firstName: 'Gael', lastName: 'Barbier Durango', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Juan Martin', lastName: 'Benalcázar Luna', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Julian Alejandro', lastName: 'Bolaños Mejia', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Cristobal Martín', lastName: 'Buendía Intriago', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Giselle Israela', lastName: 'Burgos Arcos', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Valeria Micaela', lastName: 'Capelo Carrillo', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Nicolás Xavier', lastName: 'Cazar Pesántez', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Nicolas', lastName: 'Cevallos Moscoso', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Danilo Emilio', lastName: 'Cisneros Cobo', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Domenica Monserrate', lastName: 'Erazo García', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Antonio', lastName: 'Guaman Guerra', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Francisco', lastName: 'Lascano Noboa', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ariana Milena', lastName: 'León Álvarez', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Luciana Valentina', lastName: 'Loza Riofrío', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sara Martina', lastName: 'Molina Fernández', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sophie Doménica', lastName: 'Montesdeoca Burbano', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Olivia Estefania', lastName: 'Ordoñez Arroyo', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Zoé Antonella', lastName: 'Ortiz Arroba', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Julia', lastName: 'Puente Porras', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Alina Rafaela', lastName: 'Santamaria Paredes', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Juan Manuel', lastName: 'Suarez Escobar', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Santiago Andrés', lastName: 'Subía Torres', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Eva Maria', lastName: 'Villacreses Arboleda', classroom: '6D', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Rafael Modesto', lastName: 'Zúñiga Salgado', classroom: '6D', validatedQuestions: [], validatedLevels: [] },

    // === 5eB ===
    { firstName: 'William Wladimir', lastName: 'Acosta Acuña', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Lucciana Isabella', lastName: 'Alarcón Córdova', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Juan Martín', lastName: 'Arellano Izurieta', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'David', lastName: 'Cabrera Svistoonoff', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Romina Fabiana', lastName: 'Cajas Calderon', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ariana Micaela', lastName: 'Carrera Alarcón', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'David Fernando', lastName: 'Fárez Figueroa', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Juan Andrés', lastName: 'Gómez Aveiga', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Thiago', lastName: 'Irazábal Sevilla', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Aleksey Victor', lastName: 'Irribarra Telishevskiy', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Samantha Valentina', lastName: 'Jaramillo Beltrán', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Esteban Martin', lastName: 'Lima Vaca', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Amelia Fabiana', lastName: 'Merino Martínez', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Maxime Arnaud Marie', lastName: 'Michel Rodriguez', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Anahi Aracely', lastName: 'Morales Cuaichar', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Rafaela', lastName: 'Parra Quezada', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Pedro Sebastian', lastName: 'Patiño Guerrero', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Diego Julián', lastName: 'Pazmiño Rojas', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sebastian Alejandro', lastName: 'Pilicita Paucarima', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sara', lastName: 'Regalado Moya', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Barbara', lastName: 'Salvador Mendez', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Noelia Isabel', lastName: 'Taco Menéndez', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Doménica Cristina', lastName: 'Uquillas Mera', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Christian', lastName: 'Vargas Vinces', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ariana Victoria', lastName: 'Vinueza Ortega', classroom: '5B', validatedQuestions: [], validatedLevels: [] },
    
    // === 5eC ===
    { firstName: 'Emilio José', lastName: 'Arguello Estevez', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sofía Isabella', lastName: 'Bravo Carrillo', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Paula Valentina', lastName: 'Cartuche López', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Isabella Victoria', lastName: 'Chávez Freire', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Antonela', lastName: 'Garcia Yandún', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Josué Rafael', lastName: 'González Alcívar', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Isabel Maria', lastName: 'Guerrero Durango', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Paula Rafaela', lastName: 'Guerrero Lozada', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Nicolas Aleph', lastName: 'Herrera Zambonino', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Karol Rafaela', lastName: 'Jativa Araujo', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Abigail Desirée', lastName: 'Jimbo Gavilanes', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Salvador', lastName: 'Maldonado Carcelén', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ian Fernando', lastName: 'Mediavilla Amores', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Bruno André', lastName: 'Miño Yépez', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Guillermo Joaquin', lastName: 'Molina Alcivar', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'María Victoria', lastName: 'Moya Camacho', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Camilo Rafael', lastName: 'Ruiz Menéndez', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ariana Valentina', lastName: 'Sanguña Lincango', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Mai', lastName: 'Segovia Moran', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Amina', lastName: 'Strzoda Coudour', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Isabella', lastName: 'Terán Camacho', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Emilia Joaquina', lastName: 'Vásconez Barreno', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Emilio Cayetano', lastName: 'Verdu Moscoso', classroom: '5C', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Jérémie', lastName: 'Wattel Páez', classroom: '5C', validatedQuestions: [], validatedLevels: [] },

    // === 2de A ===
    { firstName: 'Juan Martín', lastName: 'Abad Barrera', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sofía Rafaela', lastName: 'Arízaga Carrillo', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Isabella', lastName: 'Benavides Moscoso', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Amaru Joaquin Fernando', lastName: 'Caprace Lima', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Luisa Antonia', lastName: 'Cueva Marchán', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Salvatore Miguel', lastName: 'Defina Dávila', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'María Daniela', lastName: 'Erazo García', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Alejandro Renan', lastName: 'Escobar Castro', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sebastian Alejandro', lastName: 'Gallardo Buitron', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Julián Esteban', lastName: 'León Mazón', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Renata', lastName: 'López Ballesteros', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ana Rafaela', lastName: 'Lopez Mejia', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Mattis Raphaël', lastName: 'Mejia Zenni', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Clémentine Audrey', lastName: 'Nedelec Félix', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Juan Manuel', lastName: 'Nieto Estrella', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Camila Helena', lastName: 'Ortiz Betancourt', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Pedro Facundo', lastName: 'Riofrío Dressendörfer', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Daniela', lastName: 'Ruiz Turín', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Aurora Catalina', lastName: 'Sánchez Echeverría', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Florencia Alegría', lastName: 'Sánchez Porras', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Benjamin', lastName: 'Vásconez Galefski', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Juan Andrés', lastName: 'Velez Palacios', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Ariana Valentina', lastName: 'Vivero Villacis', classroom: '2A', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Joaquín Ignacio', lastName: 'Zambrano Alvarado', classroom: '2A', validatedQuestions: [], validatedLevels: [] },

    // === 2de CD ===
    { firstName: 'Felipe Andrés', lastName: 'Carrera Alarcón', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Nico Cruz', lastName: 'Hamilton Perez', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Viktor Octavio', lastName: 'Orellana Alonso', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Emilio', lastName: 'Ortiz Cerda', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Emilio', lastName: 'Perez Coral', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'María Caridad', lastName: 'Poveda Zavala', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Carolina Alelí', lastName: 'Ruiz Dueñas', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Cristián Alejandro', lastName: 'Salinas Villarreal', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Doménica Renata', lastName: 'Santacruz Granda', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Josué Mathieu', lastName: 'Santorum Carrión', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Sofía Monserrat', lastName: 'Tingo Chacasaguay', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Leonardo', lastName: 'Vargas Vinces', classroom: '2CD', validatedQuestions: [], validatedLevels: [] },
    { firstName: 'Antonio Salvador', lastName: 'Zuñiga Salgado', classroom: '2CD', validatedQuestions: [], validatedLevels: [] }
];

async function initializeDatabase() {
  try {
    console.log('Connexion à la base de données...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connexion réussie !');

    console.log('Suppression des anciens élèves (pour mise à jour du schéma)...');
    await Player.deleteMany({});
    console.log('Base nettoyée.');

    console.log('Ajout des élèves avec nouvelle structure...');
    await Player.insertMany(players);
    console.log(`✅ ${players.length} élèves ajoutés avec succès !`);

  } catch (err) {
    console.error('❌ Erreur :', err);
  } finally {
    await mongoose.disconnect();
    console.log('Déconnexion.');
  }
}

initializeDatabase();