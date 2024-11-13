const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Укажите ваш API токен
const token = '7758731240:AAHEtPHVTX-CfWqlwVk7zTim1_SwUHqFbcc';
const bot = new TelegramBot(token, { polling: true });

// Укажите ваш Telegram ID, куда бот будет отправлять заявки
const ADMIN_CHAT_ID = 2030128216;

// Список команд бота
const commands = `
/start - Начать работу с ботом
/help - Показать список команд
/submit_case - Подать заявление в суд
`;

// Приветственное сообщение при запуске
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `Привет, ${msg.from.first_name}! Я бот для подачи заявлений в суд. Используйте команду /help, чтобы увидеть список команд.`);
});

// Команда /help для показа списка доступных команд
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `Список команд: ${commands}`);
});

// Команда /submit_case для подачи заявления
bot.onText(/\/submit_case/, (msg) => {
  const chatId = msg.chat.id;

  // Запрос каждого поля в отдельности
  bot.sendMessage(chatId, 'Кто подает заявление?')
    .then(() => {
      bot.once('message', (msg) => {
        const applicant = msg.text;

        bot.sendMessage(chatId, 'На кого подается заявление?')
          .then(() => {
            bot.once('message', (msg) => {
              const respondent = msg.text;

              bot.sendMessage(chatId, 'Что произошло? Опишите событие.')
                .then(() => {
                  bot.once('message', (msg) => {
                    const incident = msg.text;

                    bot.sendMessage(chatId, 'Дополнительная информация (если есть).')
                      .then(() => {
                        bot.once('message', (msg) => {
                          const additionalInfo = msg.text || 'Нет';

                          bot.sendMessage(chatId, 'Какие требования к ответчику?')
                            .then(() => {
                              bot.once('message', (msg) => {
                                const requirements = msg.text;

                                // Формируем текст заявления
                                const caseText = `
Заявление в суд:
*Кто подает:* ${applicant}
*На кого:* ${respondent}
*Что произошло:* ${incident}
*Дополнительная информация:* ${additionalInfo}
*Требования:* ${requirements}
                                `;

                                // Отправляем заявление обратно пользователю для подтверждения
                                bot.sendMessage(chatId, caseText, { parse_mode: 'Markdown' });

                                // Отправляем заявление администратору
                                bot.sendMessage(ADMIN_CHAT_ID, `Новая заявка от пользователя ${msg.from.first_name}:\n${caseText}`, { parse_mode: 'Markdown' });
                              });
                            });
                        });
                      });
                  });
                });
            });
          });
      });
    });
});

// Настройка простого express сервера
const app = express();
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Создаем endpoint для запуска бота на Replit
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
