// Quote object shape:
// {
//   text: string,           // The quote itself, clear and self-explanatory
//   author?: string,        // Required for all gen quotes
//   id: string,             // Stable kebab-case slug (e.g., 'gen-m-1', 'yt-a-2'); never reuse or rename
//   timeOfDay: string,      // 'morning' | 'afternoon' | 'evening' | 'night'
//   site?: string,          // Optional; substring matched against blocked site (e.g., 'youtube', 'reddit')
//   signature?: true,       // Optional; user's personal quotes, 10% draw chance
//   source?: string,        // URL where the quote can be verified (required for general quotes) — must contain the actual quote text
//   philosophySource?: string, // URL to author's work/philosophy for deeper exploration (optional)
// }
//
// Time ranges (local hour):
//   morning   6–10
//   afternoon 11–16
//   evening   17–22
//   night     23–5

// ─── GENERAL ────────────────────────────────────────────────────────────────

export const QUOTES = [

  // Morning
  { text: "Every morning, when we wake up, we have twenty-four brand-new hours to live. What a precious gift!", author: "Thich Nhat Hanh", id: 'gen-m-9', timeOfDay: 'morning', source: 'https://archive.org/stream/PeaceIsEveryStep-ThichNhatHanh/ThichTextNew_djvu.txt', philosophySource: 'https://plumvillage.org/about/thich-nhat-hanh/' },
  { text: "The morning is wiser than the evening.", author: "Russian proverb", id: 'gen-m-1', timeOfDay: 'morning', source: 'https://en.wikisource.org/wiki/Russian_Folk-Tales/Vasil%C3%ADsa_the_Fair', philosophySource: 'https://en.wikipedia.org/wiki/Russian_proverbs' },
  { text: "Morning is wonderful. Its only drawback is that it comes at such an inconvenient time of day.", author: "Glen Cook", id: 'gen-m-4', timeOfDay: 'morning', source: 'https://en.wikiquote.org/wiki/Glen_Cook', philosophySource: 'https://en.wikipedia.org/wiki/Glen_Cook' },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb", id: 'gen-m-6', timeOfDay: 'morning', source: 'https://en.wiktionary.org/wiki/%E4%B8%83%E8%BB%A2%E3%81%B3%E5%85%AB%E8%B5%B7%E3%81%8D', philosophySource: 'https://en.wikipedia.org/wiki/Japanese_proverbs' },
  { text: "Talk to yourself like someone you love.", author: "Brené Brown", id: 'gen-m-7', timeOfDay: 'morning', source: 'https://brenebrown.com/book/the-gifts-of-imperfection/', philosophySource: 'https://www.brenebrown.com/' },
  { text: "Almost everything will work again if you unplug it for a few minutes, including you.", author: "Anne Lamott", id: 'gen-m-8', timeOfDay: 'morning', source: 'https://www.salon.com/2015/04/10/anne_lamott_shares_all_that_she_knows_everyone_is_screwed_up_broken_clingy_and_scared/', philosophySource: 'https://en.wikipedia.org/wiki/Anne_Lamott' },

  // Afternoon
  { text: "Little by little fills up the measure.", author: "Swahili proverb", id: 'gen-a-5', timeOfDay: 'afternoon', source: 'https://swahiliproverbs.afrst.illinois.edu/proverbs.htm', philosophySource: 'https://en.wikipedia.org/wiki/Swahili_people' },
  { text: "A change is as good as a rest.", author: "English proverb", id: 'gen-a-13', timeOfDay: 'afternoon', source: 'https://www.phrases.org.uk/meanings/a-change-is-as-good-as-a-rest.html', philosophySource: 'https://en.wikipedia.org/wiki/Proverb' },
  { text: "I loafe and invite my soul, I lean and loafe at my ease observing a spear of summer grass.", author: "Walt Whitman", id: 'gen-a-15', timeOfDay: 'afternoon', source: 'https://en.wikisource.org/wiki/Leaves_of_Grass_(1882)/Song_of_Myself', philosophySource: 'https://en.wikipedia.org/wiki/Walt_Whitman' },
  { text: "Time has fallen asleep in the afternoon sunshine.", author: "Alexander Smith", id: 'gen-a-16', timeOfDay: 'afternoon', source: 'https://archive.org/stream/dreamthorpbookof00smituoft/dreamthorpbookof00smituoft_djvu.txt', philosophySource: 'https://en.wikipedia.org/wiki/Alexander_Smith_(poet)' },
  { text: "It is possible to live happily in the here and the now. So many conditions of happiness are available — more than enough for you to be happy right now.", author: "Thich Nhat Hanh", id: 'gen-a-17', timeOfDay: 'afternoon', source: 'https://plumvillage.org/about/thich-nhat-hanh/interviews-with-thich-nhat-hanh/oprah-talks-to-thich-nhat-hanh', philosophySource: 'https://plumvillage.org/about/thich-nhat-hanh/' },
  { text: "Paying attention acknowledges that we have something to learn from intelligences other than our own.", author: "Robin Wall Kimmerer", id: 'gen-a-18', timeOfDay: 'afternoon', source: 'https://en.wikiquote.org/wiki/Robin_Wall_Kimmerer', philosophySource: 'https://en.wikipedia.org/wiki/Robin_Wall_Kimmerer' },

  // Evening
  { text: "How we spend our days is, of course, how we spend our lives.", author: "Annie Dillard", id: 'gen-e-1', timeOfDay: 'evening', source: 'https://www.themarginalian.org/2013/06/07/annie-dillard-the-writing-life-1/', philosophySource: 'https://en.wikipedia.org/wiki/Annie_Dillard' },
  { text: "This is a delicious evening, when the whole body is one sense, and imbibes delight through every pore.", author: "Henry David Thoreau", id: 'gen-e-10', timeOfDay: 'evening', source: 'https://en.wikisource.org/wiki/Walden_(1893)_Thoreau/Chapter_V', philosophySource: 'https://en.wikipedia.org/wiki/Henry_David_Thoreau' },
  { text: "For a moment, let go of the way you appear and the things you've done. Feel the truth and power of who you are. In silence, there is much you can know.", author: "Ralph Marston", id: 'gen-e-5', timeOfDay: 'evening', source: 'https://greatday.com/motivate/081224.html', philosophySource: 'https://greatday.com/' },
  { text: "Sometimes the most important thing in a whole day is the rest we take between two deep breaths.", author: "Etty Hillesum", id: 'gen-e-6', timeOfDay: 'evening', source: 'https://archive.org/details/aninterruptedlif0000hill', philosophySource: 'https://en.wikipedia.org/wiki/Etty_Hillesum' },
  { text: "Never get so busy making a living that you forget to make a life.", author: "Dolly Parton", id: 'gen-e-7', timeOfDay: 'evening', source: 'https://x.com/DollyParton/status/20723962228', philosophySource: 'https://www.dollyparton.com/' },
  { text: "Slow and steady wins the race.", author: "Robert Lloyd", id: 'gen-e-9', timeOfDay: 'evening', source: 'https://archive.org/details/bim_eighteenth-century_the-poems-of-robert-lloy_lloyd-robert_1774/page/196/', philosophySource: 'https://en.wikipedia.org/wiki/Robert_Lloyd_(poet)' },

  // Night
  { text: "Let us go to our sleep with joy and gladness; let us say: I have lived; the course which Fortune set for me is finished.", author: "Seneca", id: 'gen-n-8', timeOfDay: 'night', source: 'https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_12', philosophySource: 'https://en.wikipedia.org/wiki/Seneca_the_Younger' },
  { text: "Something attempted, something done, has earned a night's repose.", author: "Henry Wadsworth Longfellow", id: 'gen-n-9', timeOfDay: 'night', source: 'https://poets.org/poem/village-blacksmith', philosophySource: 'https://en.wikipedia.org/wiki/Henry_Wadsworth_Longfellow' },
  { text: "Sleep is the golden chain that ties health and our bodies together.", author: "Thomas Dekker", id: 'gen-n-1', timeOfDay: 'night', source: 'https://archive.org/details/gullshornbook00mckegoog', philosophySource: 'https://en.wikipedia.org/wiki/Thomas_Dekker_(writer)' },
  { text: "A good laugh and a long sleep are the two best cures in the doctor's book.", author: "Irish proverb", id: 'gen-n-2', timeOfDay: 'night', source: 'https://cumann-na-gaeilge.org/seanfhocail/', philosophySource: 'https://en.wikipedia.org/wiki/Irish_folklore' },
  { text: "Sleep is not an optional lifestyle luxury. It is a non-negotiable biological necessity.", author: "Matthew Walker", id: 'gen-n-3', timeOfDay: 'night', source: 'https://en.wikiquote.org/wiki/Matthew_Walker_(scientist)', philosophySource: 'https://www.sleepdiplomat.com/' },
  { text: "After sixteen hours of being awake, the brain begins to fail.", author: "Matthew Walker", id: 'gen-n-6', timeOfDay: 'night', source: 'https://en.wikiquote.org/wiki/Matthew_Walker_(scientist)', philosophySource: 'https://www.sleepdiplomat.com/' },

  // ─── YOUTUBE ──────────────────────────────────────────────────────────────

  { text: "Starting the day with YouTube is starting the day on someone else's terms.",    id: 'yt-m-1', timeOfDay: 'morning',   site: 'youtube' },
  { text: "The algorithm does not have your best interests at heart. Especially not at this hour.", id: 'yt-m-2', timeOfDay: 'morning', site: 'youtube' },
  { text: "Whatever you were 'just going to watch one video' of — it worked.",             id: 'yt-m-3', timeOfDay: 'morning',   site: 'youtube' },

  { text: "The recommended sidebar is not a to-do list.",                                  id: 'yt-a-1', timeOfDay: 'afternoon', site: 'youtube' },
  { text: "You've watched enough. The creator will still be there tomorrow.",              id: 'yt-a-2', timeOfDay: 'afternoon', site: 'youtube' },
  { text: "Autoplay is not a plan.",                                                        id: 'yt-a-3', timeOfDay: 'afternoon', site: 'youtube' },

  { text: "Just one more video has been a lie every time.",                                 id: 'yt-e-1', timeOfDay: 'evening',   site: 'youtube' },
  { text: "The comments section will not improve your evening.",                            id: 'yt-e-2', timeOfDay: 'evening',   site: 'youtube' },
  { text: "You've seen enough content for today. Go make some life instead.",              id: 'yt-e-3', timeOfDay: 'evening',   site: 'youtube' },

  { text: "The algorithm doesn't know it's 2am. You do.",                                  id: 'yt-n-1', timeOfDay: 'night',     site: 'youtube' },
  { text: "No video has ever been worth losing sleep over.",                                id: 'yt-n-2', timeOfDay: 'night',     site: 'youtube' },
  { text: "YouTube will still have videos tomorrow. Promise.",                              id: 'yt-n-3', timeOfDay: 'night',     site: 'youtube' },

  // ─── REDDIT ───────────────────────────────────────────────────────────────

  { text: "The front page was the same yesterday. And the day before.",                    id: 'rd-m-1', timeOfDay: 'morning',   site: 'reddit' },
  { text: "Nothing on Reddit requires your attention before coffee.",                       id: 'rd-m-2', timeOfDay: 'morning',   site: 'reddit' },
  { text: "The discourse will continue without you.",                                       id: 'rd-m-3', timeOfDay: 'morning',   site: 'reddit' },

  { text: "The top comment is not always right. You knew this.",                           id: 'rd-a-1', timeOfDay: 'afternoon', site: 'reddit' },
  { text: "You were not going to change anyone's mind in that thread.",                    id: 'rd-a-2', timeOfDay: 'afternoon', site: 'reddit' },
  { text: "The subreddit will still be there. The afternoon won't.",                       id: 'rd-a-3', timeOfDay: 'afternoon', site: 'reddit' },

  { text: "Scrolling Reddit is not the same as relaxing.",                                  id: 'rd-e-1', timeOfDay: 'evening',   site: 'reddit' },
  { text: "Whatever drama unfolded today, it'll be a recap post tomorrow.",                id: 'rd-e-2', timeOfDay: 'evening',   site: 'reddit' },
  { text: "The upvotes were not going to make the post better.",                           id: 'rd-e-3', timeOfDay: 'evening',   site: 'reddit' },

  { text: "Late-night Reddit is a different, worse Reddit.",                                id: 'rd-n-1', timeOfDay: 'night',     site: 'reddit' },
  { text: "The thread will be locked by morning anyway.",                                   id: 'rd-n-2', timeOfDay: 'night',     site: 'reddit' },
  { text: "No one is posting anything important at this hour. Including you.",             id: 'rd-n-3', timeOfDay: 'night',     site: 'reddit' },

  // ─── TWITCH ───────────────────────────────────────────────────────────────

  { text: "Watching someone else play games before noon is a choice.",                     id: 'tw-m-1', timeOfDay: 'morning',   site: 'twitch' },
  { text: "The stream will go on without your viewer count.",                               id: 'tw-m-2', timeOfDay: 'morning',   site: 'twitch' },
  { text: "Your favourite streamer is probably asleep right now anyway.",                  id: 'tw-m-3', timeOfDay: 'morning',   site: 'twitch' },

  { text: "Chat moves too fast for you to read anyway.",                                    id: 'tw-a-1', timeOfDay: 'afternoon', site: 'twitch' },
  { text: "You weren't going to clip that moment. Be honest.",                             id: 'tw-a-2', timeOfDay: 'afternoon', site: 'twitch' },
  { text: "Passive streaming is passive time. You noticed.",                                id: 'tw-a-3', timeOfDay: 'afternoon', site: 'twitch' },

  { text: "The stream will VOD. Your evening won't.",                                       id: 'tw-e-1', timeOfDay: 'evening',   site: 'twitch' },
  { text: "You can catch the highlights tomorrow.",                                         id: 'tw-e-2', timeOfDay: 'evening',   site: 'twitch' },
  { text: "Watching someone else have fun is not the same as having fun.",                 id: 'tw-e-3', timeOfDay: 'evening',   site: 'twitch' },

  { text: "The streamer is being paid to be awake. You are not.",                          id: 'tw-n-1', timeOfDay: 'night',     site: 'twitch' },
  { text: "Late-night streams are designed to keep you up. Don't.",                        id: 'tw-n-2', timeOfDay: 'night',     site: 'twitch' },
  { text: "The raid train will happen without you.",                                        id: 'tw-n-3', timeOfDay: 'night',     site: 'twitch' },

  // ─── TIKTOK ───────────────────────────────────────────────────────────────

  { text: "The For You page was not curated with your morning in mind.",                   id: 'tt-m-1', timeOfDay: 'morning',   site: 'tiktok' },
  { text: "You opened TikTok to watch one video. We both know how that goes.",             id: 'tt-m-2', timeOfDay: 'morning',   site: 'tiktok' },
  { text: "Starting the day in a scroll spiral is optional.",                               id: 'tt-m-3', timeOfDay: 'morning',   site: 'tiktok' },

  { text: "Each video is short. The session is not.",                                       id: 'tt-a-1', timeOfDay: 'afternoon', site: 'tiktok' },
  { text: "The algorithm has no concept of 'enough'. You do.",                             id: 'tt-a-2', timeOfDay: 'afternoon', site: 'tiktok' },
  { text: "Fifteen seconds at a time is still time.",                                       id: 'tt-a-3', timeOfDay: 'afternoon', site: 'tiktok' },

  { text: "The FYP will have new content tomorrow. It always does.",                       id: 'tt-e-1', timeOfDay: 'evening',   site: 'tiktok' },
  { text: "You were never going to find the last video.",                                   id: 'tt-e-2', timeOfDay: 'evening',   site: 'tiktok' },
  { text: "Infinite scroll has no finish line by design.",                                  id: 'tt-e-3', timeOfDay: 'evening',   site: 'tiktok' },

  { text: "TikTok at night is a different timezone's content anyway.",                     id: 'tt-n-1', timeOfDay: 'night',     site: 'tiktok' },
  { text: "The sound-off scroll at midnight is not relaxing. It's just delay.",            id: 'tt-n-2', timeOfDay: 'night',     site: 'tiktok' },
  { text: "You set this limit because you knew this moment would come.",                   id: 'tt-n-3', timeOfDay: 'night',     site: 'tiktok' },

  // ─── TWITTER / X ──────────────────────────────────────────────────────────

  { text: "The discourse started without you and will end without you.",                   id: 'x-m-1', timeOfDay: 'morning',   site: 'twitter' },
  { text: "Reading hot takes at this hour sets a tone for the day.",                       id: 'x-m-2', timeOfDay: 'morning',   site: 'twitter' },
  { text: "Nothing trending right now needed your attention before breakfast.",             id: 'x-m-3', timeOfDay: 'morning',   site: 'twitter' },

  { text: "The ratio will resolve itself without your involvement.",                        id: 'x-a-1', timeOfDay: 'afternoon', site: 'twitter' },
  { text: "You were not going to write the tweet that changed anyone's mind.",             id: 'x-a-2', timeOfDay: 'afternoon', site: 'twitter' },
  { text: "Chronological or algorithmic — neither timeline is worth this.",                id: 'x-a-3', timeOfDay: 'afternoon', site: 'twitter' },

  { text: "Evening Twitter is just morning Twitter with more typos.",                       id: 'x-e-1', timeOfDay: 'evening',   site: 'twitter' },
  { text: "The hot take will still be hot tomorrow.",                                       id: 'x-e-2', timeOfDay: 'evening',   site: 'twitter' },
  { text: "Doomscrolling is a description, not a recommendation.",                         id: 'x-e-3', timeOfDay: 'evening',   site: 'twitter' },

  { text: "Late-night posting is almost never a good idea.",                                id: 'x-n-1', timeOfDay: 'night',     site: 'twitter' },
  { text: "Whatever is trending at this hour will be forgotten by morning.",               id: 'x-n-2', timeOfDay: 'night',     site: 'twitter' },
  { text: "The reply you were composing was not worth losing sleep over.",                 id: 'x-n-3', timeOfDay: 'night',     site: 'twitter' },

  // ─── INSTAGRAM ────────────────────────────────────────────────────────────

  { text: "Other people's highlight reels are a bad way to start a day.",                  id: 'ig-m-1', timeOfDay: 'morning',   site: 'instagram' },
  { text: "The algorithm curated that feed. Your morning deserves better curation.",       id: 'ig-m-2', timeOfDay: 'morning',   site: 'instagram' },
  { text: "No one's story needed your view before 11am.",                                  id: 'ig-m-3', timeOfDay: 'morning',   site: 'instagram' },

  { text: "Reels are TikTok with better lighting. Same spiral.",                           id: 'ig-a-1', timeOfDay: 'afternoon', site: 'instagram' },
  { text: "The posts will still be there. They don't expire.",                             id: 'ig-a-2', timeOfDay: 'afternoon', site: 'instagram' },
  { text: "Comparing your afternoon to someone else's photoshoot is optional.",            id: 'ig-a-3', timeOfDay: 'afternoon', site: 'instagram' },

  { text: "Stories disappear after 24 hours. Your evening does too.",                      id: 'ig-e-1', timeOfDay: 'evening',   site: 'instagram' },
  { text: "The Explore page was not designed with your wellbeing in mind.",                id: 'ig-e-2', timeOfDay: 'evening',   site: 'instagram' },
  { text: "You've seen enough curated moments for one day.",                               id: 'ig-e-3', timeOfDay: 'evening',   site: 'instagram' },

  { text: "Late-night Instagram is just loneliness with filters.",                          id: 'ig-n-1', timeOfDay: 'night',     site: 'instagram' },
  { text: "No one is posting anything real at this hour.",                                  id: 'ig-n-2', timeOfDay: 'night',     site: 'instagram' },
  { text: "The grid will look the same tomorrow.",                                          id: 'ig-n-3', timeOfDay: 'night',     site: 'instagram' },

  // ─── FACEBOOK ─────────────────────────────────────────────────────────────

  { text: "The family group chat was not an urgent notification.",                          id: 'fb-m-1', timeOfDay: 'morning',   site: 'facebook' },
  { text: "Facebook memories are rarely a good morning surprise.",                          id: 'fb-m-2', timeOfDay: 'morning',   site: 'facebook' },
  { text: "The marketplace listing will still be there after breakfast.",                   id: 'fb-m-3', timeOfDay: 'morning',   site: 'facebook' },

  { text: "The opinions in your feed were not going to change yours.",                     id: 'fb-a-1', timeOfDay: 'afternoon', site: 'facebook' },
  { text: "Events you won't attend can wait.",                                              id: 'fb-a-2', timeOfDay: 'afternoon', site: 'facebook' },
  { text: "The engagement bait post does not need your engagement.",                        id: 'fb-a-3', timeOfDay: 'afternoon', site: 'facebook' },

  { text: "The group drama will resolve without your input.",                               id: 'fb-e-1', timeOfDay: 'evening',   site: 'facebook' },
  { text: "Suggested posts are not suggestions. They're traps.",                           id: 'fb-e-2', timeOfDay: 'evening',   site: 'facebook' },
  { text: "You were not going to post anything you'd be proud of right now.",              id: 'fb-e-3', timeOfDay: 'evening',   site: 'facebook' },

  { text: "Night Facebook is just old content and older arguments.",                        id: 'fb-n-1', timeOfDay: 'night',     site: 'facebook' },
  { text: "Whatever notification brought you here — it waited this long already.",         id: 'fb-n-2', timeOfDay: 'night',     site: 'facebook' },
  { text: "The Marketplace deal will still be listed tomorrow.",                            id: 'fb-n-3', timeOfDay: 'night',     site: 'facebook' },

  // ─── AMAZON ───────────────────────────────────────────────────────────────

  { text: "Nothing in your cart needs to be purchased before noon.",                        id: 'az-m-1', timeOfDay: 'morning',   site: 'amazon' },
  { text: "The deal of the day will be replaced by a new deal tomorrow.",                  id: 'az-m-2', timeOfDay: 'morning',   site: 'amazon' },
  { text: "You opened Amazon to look at one thing. We both know that's not how it goes.", id: 'az-m-3', timeOfDay: 'morning',   site: 'amazon' },

  { text: "The reviews section is a rabbit hole with a purchase at the end.",              id: 'az-a-1', timeOfDay: 'afternoon', site: 'amazon' },
  { text: "If you need it, it'll still be available later.",                               id: 'az-a-2', timeOfDay: 'afternoon', site: 'amazon' },
  { text: "Frequently bought together is not a shopping list.",                             id: 'az-a-3', timeOfDay: 'afternoon', site: 'amazon' },

  { text: "Evening browsing is how wishlists become regrets.",                              id: 'az-e-1', timeOfDay: 'evening',   site: 'amazon' },
  { text: "Prime delivery is fast. Your decision doesn't have to be.",                    id: 'az-e-2', timeOfDay: 'evening',   site: 'amazon' },
  { text: "The recommended section was built to keep you here. You noticed.",              id: 'az-e-3', timeOfDay: 'evening',   site: 'amazon' },

  { text: "Late-night purchases have a morning-after feeling.",                             id: 'az-n-1', timeOfDay: 'night',     site: 'amazon' },
  { text: "Sleep on it. Literally.",                                                        id: 'az-n-2', timeOfDay: 'night',     site: 'amazon' },
  { text: "One-click ordering at midnight is not a superpower.",                            id: 'az-n-3', timeOfDay: 'night',     site: 'amazon' },

  // ─── SHOPPING (catch-all) ─────────────────────────────────────────────────

  { text: "A morning purchase is rarely a considered one.",                                 id: 'sh-m-1', timeOfDay: 'morning',   site: 'shop' },
  { text: "The item will still be listed after you've had breakfast.",                     id: 'sh-m-2', timeOfDay: 'morning',   site: 'shop' },
  { text: "Want and need are different words for a reason.",                                id: 'sh-m-3', timeOfDay: 'morning',   site: 'shop' },

  { text: "If you've been browsing long enough to hit a limit, you're not shopping. You're scrolling.", id: 'sh-a-1', timeOfDay: 'afternoon', site: 'shop' },
  { text: "The sale ends when it ends. Your afternoon ends at midnight.",                   id: 'sh-a-2', timeOfDay: 'afternoon', site: 'shop' },
  { text: "Add to cart is not the same as buy. Give it a day.",                            id: 'sh-a-3', timeOfDay: 'afternoon', site: 'shop' },

  { text: "Evening browsing has a way of becoming morning regret.",                         id: 'sh-e-1', timeOfDay: 'evening',   site: 'shop' },
  { text: "The checkout button will still work tomorrow.",                                   id: 'sh-e-2', timeOfDay: 'evening',   site: 'shop' },
  { text: "Window shopping online is still shopping.",                                      id: 'sh-e-3', timeOfDay: 'evening',   site: 'shop' },

  { text: "Midnight purchases are a category of their own.",                                id: 'sh-n-1', timeOfDay: 'night',     site: 'shop' },
  { text: "Sleep is free. That thing is not.",                                              id: 'sh-n-2', timeOfDay: 'night',     site: 'shop' },
  { text: "The listing will still be there in the morning. You'll see it differently.",    id: 'sh-n-3', timeOfDay: 'night',     site: 'shop' },

  // ─── LINKEDIN ─────────────────────────────────────────────────────────────

  { text: "Hustle culture content before 9am is not inspiration. It's pressure.",          id: 'li-m-1', timeOfDay: 'morning',   site: 'linkedin' },
  { text: "The job listing will still be open after breakfast.",                            id: 'li-m-2', timeOfDay: 'morning',   site: 'linkedin' },
  { text: "No one's career update needed your reaction this early.",                       id: 'li-m-3', timeOfDay: 'morning',   site: 'linkedin' },

  { text: "Thought leadership can wait. You have actual work.",                             id: 'li-a-1', timeOfDay: 'afternoon', site: 'linkedin' },
  { text: "The connection request is not urgent.",                                           id: 'li-a-2', timeOfDay: 'afternoon', site: 'linkedin' },
  { text: "Comparing careers mid-afternoon helps no one, especially yours.",               id: 'li-a-3', timeOfDay: 'afternoon', site: 'linkedin' },

  { text: "After-hours LinkedIn is just work anxiety with a feed.",                         id: 'li-e-1', timeOfDay: 'evening',   site: 'linkedin' },
  { text: "The viral post about someone's overnight success took years.",                  id: 'li-e-2', timeOfDay: 'evening',   site: 'linkedin' },
  { text: "You are more than your profile. Step away from it.",                            id: 'li-e-3', timeOfDay: 'evening',   site: 'linkedin' },

  { text: "Midnight job searching is a specific kind of spiral.",                           id: 'li-n-1', timeOfDay: 'night',     site: 'linkedin' },
  { text: "No recruiter is reading your profile right now. Rest.",                         id: 'li-n-2', timeOfDay: 'night',     site: 'linkedin' },
  { text: "The inspirational post will be just as hollow in the morning.",                 id: 'li-n-3', timeOfDay: 'night',     site: 'linkedin' },

  // ─── NEWS ─────────────────────────────────────────────────────────────────

  { text: "The headlines were written to alarm you. Don't let them.",                      id: 'nw-m-1', timeOfDay: 'morning',   site: 'news' },
  { text: "Informed is good. Saturated before 9am is something else.",                     id: 'nw-m-2', timeOfDay: 'morning',   site: 'news' },
  { text: "The world will still be turning after breakfast.",                               id: 'nw-m-3', timeOfDay: 'morning',   site: 'news' },

  { text: "Refreshing the news does not change the news.",                                  id: 'nw-a-1', timeOfDay: 'afternoon', site: 'news' },
  { text: "You are already informed enough to have an opinion. You don't need more.",      id: 'nw-a-2', timeOfDay: 'afternoon', site: 'news' },
  { text: "Breaking news rarely is.",                                                       id: 'nw-a-3', timeOfDay: 'afternoon', site: 'news' },

  { text: "The evening news cycle is designed to keep you anxious and clicking.",          id: 'nw-e-1', timeOfDay: 'evening',   site: 'news' },
  { text: "You've read enough today. The news will summarise itself by morning.",          id: 'nw-e-2', timeOfDay: 'evening',   site: 'news' },
  { text: "Being informed is a virtue. Being saturated is a habit.",                       id: 'nw-e-3', timeOfDay: 'evening',   site: 'news' },

  { text: "Nothing in the news requires your attention at this hour.",                      id: 'nw-n-1', timeOfDay: 'night',     site: 'news' },
  { text: "The story will still be developing tomorrow. So will you.",                     id: 'nw-n-2', timeOfDay: 'night',     site: 'news' },
  { text: "Late-night news reading is anxiety with a byline.",                              id: 'nw-n-3', timeOfDay: 'night',     site: 'news' },

  // ─── CHATGPT ──────────────────────────────────────────────────────────────

  { text: "You asked an AI to help you be more productive. It's working.",                 id: 'cg-m-1', timeOfDay: 'morning',   site: 'chatgpt' },
  { text: "The prompt can wait. So can the answer.",                                        id: 'cg-m-2', timeOfDay: 'morning',   site: 'chatgpt' },
  { text: "Some mornings the most productive thing is to think for yourself first.",       id: 'cg-m-3', timeOfDay: 'morning',   site: 'chatgpt' },

  { text: "You set a limit on an AI assistant. The irony is not lost.",                    id: 'cg-a-1', timeOfDay: 'afternoon', site: 'chatgpt' },
  { text: "The conversation will still be in your history when you return.",               id: 'cg-a-2', timeOfDay: 'afternoon', site: 'chatgpt' },
  { text: "Even AI tools can become avoidance tools.",                                      id: 'cg-a-3', timeOfDay: 'afternoon', site: 'chatgpt' },

  { text: "You've used your AI time for today. Trust your own brain for the rest.",        id: 'cg-e-1', timeOfDay: 'evening',   site: 'chatgpt' },
  { text: "The chatbot will give you the same answer tomorrow.",                            id: 'cg-e-2', timeOfDay: 'evening',   site: 'chatgpt' },
  { text: "Some problems are better slept on than prompted on.",                            id: 'cg-e-3', timeOfDay: 'evening',   site: 'chatgpt' },

  { text: "The AI doesn't need sleep. You do.",                                             id: 'cg-n-1', timeOfDay: 'night',     site: 'chatgpt' },
  { text: "Midnight AI conversations have a way of going nowhere slowly.",                 id: 'cg-n-2', timeOfDay: 'night',     site: 'chatgpt' },
  { text: "You trained a limit on yourself. Respect it.",                                   id: 'cg-n-3', timeOfDay: 'night',     site: 'chatgpt' },

  // ─── GEMINI ───────────────────────────────────────────────────────────────

  { text: "You asked an AI to help you focus. Consider this it helping.",                  id: 'gm-m-1', timeOfDay: 'morning',   site: 'gemini' },
  { text: "The model will still be there. Your morning window won't.",                     id: 'gm-m-2', timeOfDay: 'morning',   site: 'gemini' },
  { text: "Some questions are worth sitting with before asking an AI.",                    id: 'gm-m-3', timeOfDay: 'morning',   site: 'gemini' },

  { text: "Even helpful tools can fill time that could be thought.",                        id: 'gm-a-1', timeOfDay: 'afternoon', site: 'gemini' },
  { text: "The response will be just as good in an hour.",                                  id: 'gm-a-2', timeOfDay: 'afternoon', site: 'gemini' },
  { text: "You blocked an AI. That's a very 21st century problem to have.",               id: 'gm-a-3', timeOfDay: 'afternoon', site: 'gemini' },

  { text: "You've queried enough for today. Rest the prompts.",                             id: 'gm-e-1', timeOfDay: 'evening',   site: 'gemini' },
  { text: "The answer you're looking for might not be in a language model.",               id: 'gm-e-2', timeOfDay: 'evening',   site: 'gemini' },
  { text: "Some evenings the best output is no output.",                                    id: 'gm-e-3', timeOfDay: 'evening',   site: 'gemini' },

  { text: "The model runs on servers that don't need sleep. You do.",                      id: 'gm-n-1', timeOfDay: 'night',     site: 'gemini' },
  { text: "No insight generated after midnight is worth the lost sleep.",                  id: 'gm-n-2', timeOfDay: 'night',     site: 'gemini' },
  { text: "Close the tab. The answers will still be generatable tomorrow.",                id: 'gm-n-3', timeOfDay: 'night',     site: 'gemini' },

  // ─── SIGNATURE ────────────────────────────────────────────────────────────
  // Your personal quotes. 10% draw chance. Add below as prompted.

];
