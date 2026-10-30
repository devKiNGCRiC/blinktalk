// ============================================
// Icebreaker Questions
// ============================================
// One is sent to both strangers when they connect.

const ICEBREAKERS = [
    'What’s the best thing that happened to you this week?',
    'If you could live anywhere for a year, where would it be?',
    'What song have you had on repeat lately?',
    'What’s a hobby you’d pick up if you had more time?',
    'Tea or coffee, and how do you take it?',
    'What’s the last show you binge-watched?',
    'What’s a food you could eat every day?',
    'Morning person or night owl?',
    'What’s the most useless talent you have?',
    'If you could have dinner with anyone, who would it be?',
    'What’s a movie you can watch again and again?',
    'Which app do you open first in the morning?',
    'What’s something you’re looking forward to?',
    'Mountains or beaches?',
    'What’s a skill you’d love to master?',
    'What was your favourite cartoon as a kid?',
    'What’s the best trip you’ve ever taken?',
    'If you won the lottery tomorrow, what’s the first thing you’d buy?',
    'Cats or dogs?',
    'What’s a small thing that always makes your day better?',
    'What game are you playing these days?',
    'What’s the weirdest food combination you secretly love?',
    'Which fictional world would you want to live in?',
    'What’s one thing on your bucket list?',
    'What’s your go-to comfort food?',
    'If you could instantly speak any language, which one?',
    'What’s the last thing that made you laugh out loud?',
    'Rain or sunshine?',
    'What’s a book or podcast you’d recommend?',
    'What superpower would you choose?',
    'What’s your favourite season, and why?',
    'What’s something people are often surprised to learn about you?'
];

/**
 * @returns {String} - a random icebreaker question
 */
function randomIcebreaker() {
    return ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
}

module.exports = { randomIcebreaker, ICEBREAKERS };
