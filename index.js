const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// Замените на токен вашего бота
const token = '7758731240:AAHEtPHVTX-CfWqlwVk7zTim1_SwUHqFbcc';
const bot = new TelegramBot(token, { polling: true });

const usersFile = './users.json';
const finesFile = './fines.json';

// ID работников налоговой
const taxWorkers = [2030128216];  // Замените числа на ID работников налоговой

// Загрузка данных из файлов
let users = loadData(usersFile) || {};
let fines = loadData(finesFile) || {};

// Функция для загрузки данных
function loadData(filename) {
  if (fs.existsSync(filename)) {
    const data = fs.readFileSync(filename, 'utf-8');
    return JSON.parse(data);
  }
  return null;
}

// Функция для сохранения данных
function saveData(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  let helpMessage = `
  Добро пожаловать в Налоговую Сервера Мед! Вот доступные команды:

  /start - Начать взаимодействие с ботом и пройти регистрацию.
  /register <имя> - Зарегистрировать нового пользователя (каждому пользователю нужно уникальное имя). Внимание обязательно указывайте ник через @.

  Команды для пользователей:
  /balance - Посмотреть текущий баланс.
  /fines - Посмотреть ваши штрафы.
  /pay <Суммма> - Оплатить штраф (например, /pay 32). Причина - не обязательна, если не указана, будет использована причина "Оплата штрафа".

  Команды для работников налоговой:
  /fine <пользователь> <сумма> <причина> - Выписать штраф пользователю.
  `;

  bot.sendMessage(chatId, helpMessage);
});

// Проверка, является ли пользователь работником налоговой
function isTaxWorker(userId) {
  return taxWorkers.includes(userId);
}

// Команда /start - Приветственное сообщение и регистрация
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (users[chatId]) {
    bot.sendMessage(chatId, 'Вы уже зарегистрированы! Используйте /help, чтобы увидеть доступные команды.');
  } else {
    bot.sendMessage(chatId, 'Добро пожаловать в Налоговую Minecraft! Пожалуйста, зарегистрируйтесь, используя команду /register <имя>. Внимание обязательно указывайте ник через @.');
  }
});

// Регистрация нового пользователя с защитой от дублирования никнейма
// Регистрация нового пользователя с защитой от дублирования никнейма
bot.onText(/\/register (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const username = match[1];

  if (users[chatId]) {
    bot.sendMessage(chatId, 'Вы уже зарегистрированы!');
  } else {
    // Проверка, что никнейм начинается с '@'
    if (!username.startsWith('@')) {
      bot.sendMessage(chatId, 'Никнейм должен начинаться с символа "@". Пожалуйста, выберите другой никнейм.');
      return;
    }

    // Проверка на уникальность имени
    const isUsernameTaken = Object.values(users).some(user => user.username.toLowerCase() === username.toLowerCase());
    if (isUsernameTaken) {
      bot.sendMessage(chatId, `Имя "${username}" уже занято. Пожалуйста, выберите другое имя.`);
      return;
    }

    users[chatId] = { username, balance: 0 };
    saveData(usersFile, users);
    bot.sendMessage(chatId, `Регистрация успешна! Добро пожаловать, ${username}. Список доступных команд: /help`);
  }
});

// Подсказка для команды /fine (только для работников налоговой)
bot.onText(/\/fine/, (msg) => {
  if (!isTaxWorker(msg.chat.id)) {
    bot.sendMessage(msg.chat.id, 'Эта команда доступна только работникам налоговой.');
    return;
  }
  bot.sendMessage(msg.chat.id, 'Правильный формат команды: /fine <пользователь> <сумма> <причина>\nПример: /fine @username 100 Нарушение правил.');
});

// Команда для выдачи штрафа с причиной
bot.onText(/\/fine (@\w+) (\d+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const targetUsername = match[1];
  const amount = parseInt(match[2]);
  const reason = match[3];

  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, 'Пожалуйста, укажите корректную сумму штрафа.');
    return;
  }

  // Найти ID пользователя по его имени
  const userId = Object.keys(users).find(id => users[id].username === targetUsername);

  if (!userId) {
    bot.sendMessage(chatId, `Пользователь с именем ${targetUsername} не найден. Проверьте имя и попробуйте снова.`);
    return;
  }

  // Инициализация штрафов, если их нет
  if (!fines[userId]) fines[userId] = [];

  // Добавление штрафа с причиной
  fines[userId].push({ amount, reason, date: new Date().toISOString(), paid: false });

  // Вычитание суммы штрафа из баланса (в том числе при отрицательном балансе)
  users[userId].balance -= amount;

  // Сохранение изменений
  saveData(finesFile, fines);
  saveData(usersFile, users);

  bot.sendMessage(chatId, `Штраф для ${targetUsername} на сумму ${amount} успешно добавлен. Причина: ${reason}`);
  bot.sendMessage(userId, `Вам был выписан штраф на сумму ${amount}. Причина: ${reason}. Текущий баланс: ${users[userId].balance}`);
});

// Каждую минуту проверяем штрафы на устаревшие и удваиваем те, которые не оплачены
setInterval(() => {
  const now = new Date();

  for (const userId in fines) {
    fines[userId].forEach((fine, index) => {
      const fineDate = new Date(fine.date);
      const timeDiff = now - fineDate; // Время в миллисекундах с момента получения штрафа

      // Если прошло больше недели (7 дней), удваиваем сумму штрафа
      if (!fine.paid && timeDiff >= 7 * 24 * 60 * 60 * 1000) {
        fine.amount *= 2;
        fine.date = now.toISOString(); // Обновляем дату штрафа на новую
        bot.sendMessage(userId, `Ваш штраф на сумму ${fine.amount} был удвоен за неуплату!`);
      }

      // Если прошло 2 недели (14 дней), уведомляем пользователя о подаче в суд
      if (!fine.paid && timeDiff >= 14 * 24 * 60 * 60 * 1000) {
        bot.sendMessage(userId, `Внимание! Ваш штраф на сумму ${fine.amount} не был оплачен. Будет подано дело в суд, если вы не оплатите его в ближайшее время.`);
      }
    });
  }

  // Сохраняем обновленные данные
  saveData(finesFile, fines);
}, 60 * 1000); // Проверка каждую минуту


// Команда для оплаты штрафа
bot.onText(/\/pay (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fineIndex = parseInt(match[1]);

  if (!users[chatId]) {
    bot.sendMessage(chatId, 'Вы не зарегистрированы! Используйте команду /register <имя> для регистрации.');
    return;
  }

  const userFines = fines[chatId] || [];
  if (!userFines || userFines.length <= fineIndex) {
    bot.sendMessage(chatId, '');
    return;
  }

  const fine = userFines[fineIndex];

  if (fine.paid) {
    bot.sendMessage(chatId, 'Этот штраф уже был оплачен.');
    return;
  }

  // Проверка баланса для оплаты штрафа
  if (users[chatId].balance >= fine.amount) {
    // Уменьшаем баланс пользователя и помечаем штраф как оплаченный
    users[chatId].balance -= fine.amount;
    fine.paid = true;

    // Сохраняем изменения
    saveData(usersFile, users);
    saveData(finesFile, fines);

    bot.sendMessage(chatId, `Штраф на сумму ${fine.amount} успешно оплачен. Ваш новый баланс: ${users[chatId].balance}`);
  } else {
    bot.sendMessage(chatId, `У вас недостаточно средств для оплаты штрафа. Ваш баланс: ${users[chatId].balance}`);
  }
});

// Проверка баланса
bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;

  if (users[chatId]) {
    bot.sendMessage(chatId, `Ваш баланс: ${users[chatId].balance}`);
  } else {
    bot.sendMessage(chatId, 'Вы не зарегистрированы! Используйте команду /register <имя> для регистрации.');
  }
});



// Проверка на истечение срока и удвоение штрафа
function checkFines() {
  const now = new Date();
  for (const userId in fines) {
    if (fines.hasOwnProperty(userId)) {
      fines[userId].forEach(fine => {
        const fineDate = new Date(fine.date);
        const daysPassed = Math.floor((now - fineDate) / (1000 * 60 * 60 * 24));

        // Если прошло 7 дней, удваиваем штраф
        if (daysPassed >= 7 && fine.status === 'pending') {
          fine.amount *= 2;
          bot.sendMessage(userId, `Ваш штраф был удвоен и теперь составляет ${fine.amount}. Пожалуйста, оплатите его как можно скорее.`);
        }

        // Если прошло 14 дней, предупреждаем о суде
        if (daysPassed >= 14 && fine.status === 'pending') {
          bot.sendMessage(userId, `Ваш штраф не был оплачен в течение 14 дней. Если вы не оплатите его в ближайшее время, дело будет передано в суд.`);
        }
      });
    }
  }
  saveData(finesFile, fines);
}

// Запускаем проверку штрафов каждый день (например, с интервалом 24 часа)
setInterval(checkFines, 24 * 60 * 60 * 1000);
// Команда /fine для проверки штрафов
bot.onText(/\/fine/, (msg) => {
  const chatId = msg.chat.id;

  // Проверяем, зарегистрирован ли пользователь
  if (!users[chatId]) {
    bot.sendMessage(chatId, 'Вы не зарегистрированы! Используйте команду /register <имя> для регистрации.');
    return;
  }

  // Получаем штрафы пользователя
  const userFines = fines[chatId] || [];

  if (userFines.length === 0) {
    bot.sendMessage(chatId, 'У вас нет штрафов.');
  } else {
    // Формируем сообщение со всеми штрафами
    let finesList = 'История Штрафов:\n';
    userFines.forEach((fine, index) => {
      finesList += `#${index + 1} - Сумма: ${fine.amount} | Причина: ${fine.reason} | Дата: ${fine.date}\n`;
    });
    bot.sendMessage(chatId, finesList);
  }
});

// Файл для хранения заявок на оплату
const paymentsFile = './payments.json';
let payments = loadData(paymentsFile) || [];

// Команда для создания заявки на оплату с возможной причиной
bot.onText(/\/pay (\d+)(?: (.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseInt(match[1]);
  const comment = match[2] || 'Оплата штрафа'; // Если причина не указана, ставим "Оплата штрафа"

  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, 'Пожалуйста, укажите корректную сумму для оплаты.');
    return;
  }

  if (!users[chatId]) {
    bot.sendMessage(chatId, 'Вы не зарегистрированы! Используйте команду /register <имя> для регистрации.');
    return;
  }

  // Создание заявки на оплату
  const paymentRequest = {
    userId: chatId,
    username: users[chatId].username,
    amount,
    comment,
    date: new Date().toISOString(),
    status: 'pending' // статус "ожидание подтверждения"
  };

  payments.push(paymentRequest);
  saveData(paymentsFile, payments);

  bot.sendMessage(chatId, `Заявка на оплату на сумму ${amount} создана. Ожидайте подтверждения.`);
  notifyTaxWorkers(paymentRequest);  // Уведомление для налоговых работников
});
// Команда /cancel_fine для аннулирования штрафа (только для работников налоговой)
bot.onText(/\/cancel_fine (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fineIndex = parseInt(match[1]);

  // Проверка, является ли пользователь работником налоговой
  if (!isTaxWorker(chatId)) {
    bot.sendMessage(chatId, 'Эта команда доступна только работникам налоговой.');
    return;
  }

  // Находим ID пользователя по индексу штрафа
  let targetUserId;
  for (const userId in fines) {
    if (fines[userId][fineIndex]) {
      targetUserId = userId;
      break;
    }
  }

  if (!targetUserId || !fines[targetUserId] || !fines[targetUserId][fineIndex]) {
    bot.sendMessage(chatId, 'Штраф с таким индексом не найден.');
    return;
  }

  const fine = fines[targetUserId][fineIndex];

  // Проверка, не был ли уже отменён штраф
  if (fine.cancelled) {
    bot.sendMessage(chatId, `Этот штраф уже был отменён.`);
    return;
  }

  // Аннулирование штрафа
  fine.cancelled = true;

  // Возвращаем сумму штрафа на баланс пользователя
  users[targetUserId].balance += fine.amount;

  // Сохраняем изменения в файлах
  saveData(finesFile, fines);
  saveData(usersFile, users);

  // Уведомление работников налоговой и пользователя
  bot.sendMessage(chatId, `Штраф для ${users[targetUserId].username} на сумму ${fine.amount} был успешно аннулирован.`);
  bot.sendMessage(targetUserId, `Ваш штраф на сумму ${fine.amount} был аннулирован. Ваш новый баланс: ${users[targetUserId].balance}`);
});
// Подсказка для использования /cancel_fine (если команда была написана неверно)
bot.onText(/\/cancel_fine/, (msg) => {
  const chatId = msg.chat.id;

  if (!isTaxWorker(chatId)) {
    bot.sendMessage(chatId, 'Эта команда доступна только работникам налоговой.');
    return;
  }

  bot.sendMessage(chatId, 'Используйте команду в следующем формате: /cancel_fine <индекс штрафа>\nПример: /cancel_fine 2\nКоманда отменит штраф с указанным индексом.');
});
// Функция для уведомления работников налоговой о новой заявке
function notifyTaxWorkers(paymentRequest) {
  taxWorkers.forEach(workerId => {
    bot.sendMessage(workerId, `Новая заявка на оплату:\n\nПользователь: ${paymentRequest.username}\nСумма: ${paymentRequest.amount}\nКомментарий: ${paymentRequest.comment}\nДата: ${paymentRequest.date}\n\nПодтвердите её командой /approve ${payments.length - 1}`);
  });
}

// Подтверждение оплаты заявки (только для работников налоговой)
bot.onText(/\/approve (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const paymentIndex = parseInt(match[1]);

  if (!isTaxWorker(chatId)) {
    bot.sendMessage(chatId, 'Эта команда доступна только работникам налоговой.');
    return;
  }

  if (isNaN(paymentIndex) || !payments[paymentIndex]) {
    bot.sendMessage(chatId, 'Некорректный номер заявки.');
    return;
  }

  const payment = payments[paymentIndex];

  if (payment.status !== 'pending') {
    bot.sendMessage(chatId, 'Эта заявка уже обработана.');
    return;
  }

  // Подтверждение оплаты и обновление баланса
  users[payment.userId].balance += payment.amount;
  payment.status = 'approved'; // Обновляем статус заявки

  saveData(paymentsFile, payments);
  saveData(usersFile, users);

  bot.sendMessage(chatId, `Оплата на сумму ${payment.amount} для пользователя ${payment.username} подтверждена.`);
  bot.sendMessage(payment.userId, `Ваша заявка на оплату на сумму ${payment.amount} была подтверждена! Ваш текущий баланс: ${users[payment.userId].balance}`);
});
