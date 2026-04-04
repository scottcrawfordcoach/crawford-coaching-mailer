"""
Newsletter 15 — Becoming a Snacker
April Edition 1, 2026

Source: 15-becoming-a-snacker.docx
Images: local folder (newsletters/15-becoming-a-snacker/)

TODO before send:
  - Upload images to Supabase storage and replace local paths with public URLs
"""

newsletter = {
    "subject": "April Edition 1 2026 Newsletter | Becoming a Snacker",
    "title": "Becoming a Snacker",
    "opening_quote": "Consistency is not built by never drifting. It is built by returning.",
    # ------------------------------------------------------------------
    # INTRO
    # ------------------------------------------------------------------
    "intro": {
        "body": (
            "<p>You might notice a new look to the newsletter this time. I\u2019ve built "
            "a whole new website and mailing system. There are some interactive features "
            "which you might find enjoyable, useful or enlightening. I\u2019m still building "
            "it all out, so please explore it and let me know how you get on. "
            '<a href="https://crawford-coaching.ca">Visit the new Crawford Coaching site</a>.</p>'
            "<p>This month, I have a confession to make, and it starts with something "
            "I recommended to you.</p>"
            "<p>For the past year or so, I have been eating RX Bars. Simple ingredients, "
            "no added sugar, solid protein content. The kind of thing you can eat without "
            "the usual inner negotiation that comes with reaching for a packaged food. "
            "I liked them enough to mention them in my writing. I still think they are "
            "a good product.</p>"
            "<p>Here is the problem. I have turned myself into a snacker.</p>"
            "<p>It happened the way most habit shifts happen; gradually, reasonably, "
            "without much notice. I was training more, working with multiple groups, "
            "and the extra caloric demand was real. An RX Bar between morning sessions "
            "made perfect nutritional sense. My body needed the fuel. The food was "
            "appropriate, and the timing was logical.</p>"
            "<p>What I did not account for was the door it opened.</p>"
            "<p>A morning that was previously just coffee became a morning with a snack. "
            "That snack, repeated often enough, became a pattern. The pattern began to "
            "generalise, and I started reaching for something between meals not because "
            "my body needed fuel, but because there was a gap in the day and my hands "
            "wanted something to do. Boredom. Stress. The restless energy of a busy "
            "afternoon. Suddenly, snacking was on the table as a response to all of them.</p>"
            "<p>The RX Bar did not cause this, but it was the vehicle. What happened "
            "underneath was a habit formation process that I know well enough to teach, "
            "and apparently not well enough to notice while it was happening to me.</p>"
            "<p>I was somewhat insulated from this for years by my existing eating habits. "
            "I trusted my patterns. I ate meals, not snacks, and I rarely felt the pull "
            "toward grazing. That trust, it turns out, was not a permanent character trait. "
            "It was a reflection of a particular routine. Once the routine shifted, so did "
            "everything downstream.</p>"
            "<p>This experience crystallised something I have been thinking about for a "
            "while. We love to label foods as healthy or unhealthy, clean or dirty, good "
            "or bad. These labels feel useful, but they are almost always incomplete.</p>"
            "<p>An RX Bar is not \u201chealthy\u201d or \u201cunhealthy.\u201d It is a "
            "food. Whether it supports your wellbeing depends entirely on context. Who is "
            "eating it? When? Why? What outcome are they trying to achieve? Without answers "
            "to those questions, the label is meaningless.</p>"
            "<p>The same principle applies everywhere. A slice of birthday cake shared with "
            "friends carries genuine social and emotional value that a calorie count cannot "
            "capture. Even the most \u201cunhealthy\u201d foods can have benefits that "
            "outweigh a tiny deviation from protocol. The reverse is equally true: the "
            "\u201chealthiest\u201d food on the shelf, eaten when it is not needed, is just "
            "extra calories.</p>"
            "<p>Calling a food healthy gives us permission to eat it without thinking. "
            "Calling a food unhealthy gives us permission to fear it without thinking. "
            "Neither response involves the question that actually matters.</p>"
            "<p>The rest of this issue explores what that question might be, and a few "
            "ways to start asking it.</p>"
            "<p>Scott</p>"
        ),
    },
    # ------------------------------------------------------------------
    # INTRO ACTIONS
    # ------------------------------------------------------------------
    "intro_actions": {
        "share_url": "mailto:?subject=Crawford%20Coaching%20Newsletter&body=I%20thought%20you%20might%20enjoy%20this%3A%20https%3A%2F%2Fcrawford-coaching.ca%2Fwriting%2F15-becoming-a-snacker",
        "subscribe_url": "https://crawford-coaching.ca/subscribe",
        "full_blog_url": "https://crawford-coaching.ca/writing/15-becoming-a-snacker",
        # --- not yet supported by template — flag for template update ---
        "blogcast_url": "https://yxndmpwqvdatkujcukdv.supabase.co/storage/v1/object/public/Blogcasts/15_Why_healthy_snacks_become_mindless_habits.m4a",
    },
    # ------------------------------------------------------------------
    # FOOD FOR THE BODY
    # ------------------------------------------------------------------
    "food_body": {
        "subtitle": "Eat Around, Not On Top",
        "image": "newsletters/15-becoming-a-snacker/body-plate.png",
        "image_alt": "A balanced plate built around protein",
        "cta_label": "Ask Assistant",
        "cta_url": "https://crawford-coaching.ca/assistant",
        "body": (
            "<p>\u201cEat more protein\u201d has become one of the most common pieces of "
            "nutritional advice, and for good reason. Protein is essential for muscle "
            "repair, satiety, metabolic health, and preservation of lean mass as we age. "
            "The advice is not wrong.</p>"
            "<p>The execution, however, often is.</p>"
            "<p>For someone trying to lose weight, \u201ceat more protein\u201d can quietly "
            "become \u201ceat more food.\u201d More shakes on top of existing meals. More "
            "snacks justified by their protein content. More total calories in a situation "
            "where the goal requires fewer.</p>"
            "<p>A better paradigm is not \u201ceat more protein\u201d but \u201cbuild your "
            "meals around protein\u201d. Make it a focus, not an extra. Structure the plate "
            "so protein is the foundation, and other elements fill in around it. The total "
            "intake might not change much. The composition changes significantly.</p>"
            "<p>Try this as an experiment over the next week. Before adding anything to a "
            "meal, ask whether the protein is already there as the anchor. If it is not, "
            "rearrange rather than add.</p>"
        ),
    },
    # ------------------------------------------------------------------
    # FOOD FOR THE BRAIN
    # ------------------------------------------------------------------
    "food_brain": {
        "subtitle": "One Question To Replace A Label",
        "image": "newsletters/15-becoming-a-snacker/jasmin-paris.jpg",
        "image_alt": "Jasmin Paris after finishing the 2024 Barkley Marathons",
        "image_credit": "Jacob Zocherman",
        "cta_label": "Ask Me a Question",
        "cta_url": "https://crawford-coaching.ca/contact",
        "body": (
            "<p>Instead of asking \u201cIs this food healthy?\u201d try asking: "
            "\u201cHow is this food supporting the outcome I am trying to achieve?\u201d</p>"
            "<p>That question does something the binary cannot. It forces context. It "
            "requires you to know what you are working toward and to evaluate the food "
            "against that specific aim in that specific moment.</p>"
            "<p>There is a photograph from the 2024 Barkley Marathons that illustrates "
            "this perfectly. Jasmin Paris, the first woman to ever finish the race, is "
            "sitting in a camp chair after sixty hours of running through unmarked "
            "Tennessee mountains. Legs scratched raw. Face resting in one hand. Scattered "
            "around her feet: juice boxes, Coca-Cola, oat bars, a camping stove, snack "
            "wrappers. Every item on that ground was the right choice.</p>"
            "<p>Coca-Cola, consumed during a sixty-hour effort with over 60,000 feet of "
            "elevation gain, is liquid energy in the most rapidly absorbable form available. "
            "The same bottle on a Tuesday afternoon serves a completely different purpose. "
            "The food did not change. The context did.</p>"
            "<p>The question works just as well at the kitchen counter as it does at the "
            "base camp of an ultramarathon. It simply asks you to think before you label.</p>"
        ),
    },
    # ------------------------------------------------------------------
    # FOOD FOR THOUGHT
    # ------------------------------------------------------------------
    "food_thought": {
        "subtitle": "When Good Habits Grow Legs",
        "image": "newsletters/15-becoming-a-snacker/rx-bar.png",
        "image_alt": "Hand reaching for an RX Bar beside a coffee",
        "cta_label": "Book a Chat",
        "cta_url": "https://calendar.app.google/DuKcPqs3KgNRrwjM7",
        "body": (
            "<p>In <em>Good Habits, Bad Habits</em>, Wendy Wood explains that much of our "
            "behaviour runs on autopilot, shaped by context and repetition rather than "
            "conscious choice. Once a behaviour becomes associated with a cue, it begins "
            "to fire automatically.</p>"
            "<p>This is usually discussed as a tool for building positive habits. It is "
            "less often discussed as a warning.</p>"
            "<p>A food introduced for perfectly sound reasons can become the seed of a "
            "pattern that no longer serves its original purpose. The cue shifts from hunger "
            "to boredom, from nutritional need to emotional habit. The behaviour looks the "
            "same from the outside. The function has changed entirely.</p>"
            "<p>The reflection this week is simple. Think about one food habit you consider "
            "\u201cgood.\u201d Ask yourself: is it still serving the purpose it was "
            "originally introduced for? Or has it quietly become something else?</p>"
            "<p>No judgement required. This is information, not a scorecard.</p>"
        ),
    },
    # ------------------------------------------------------------------
    # FOOD FOR THE SOUL
    # ------------------------------------------------------------------
    "food_soul": {
        "subtitle": "Permission To Think In Context",
        "image": "newsletters/15-becoming-a-snacker/peaceful-grass.png",
        "image_alt": "A forest path diverging in warm light",
        "cta_label": "Coaching Discovery Call",
        "cta_url": "https://calendar.app.google/R66fNg5m7w3aKPKd6",
        "body": (
            "<p>We would benefit from retiring the language of healthy and unhealthy as "
            "fixed labels attached to individual foods. It is reductive. It makes us feel "
            "informed while actually making us less capable of thinking clearly.</p>"
            "<p>A more honest vocabulary would acknowledge that food exists in relationship "
            "to a person, a moment, a purpose, and a set of circumstances. The same meal "
            "can be nourishing or excessive, supportive or irrelevant, depending on who is "
            "eating it and why.</p>"
            "<p>This does not mean anything goes. It does not mean nutritional quality is "
            "irrelevant. It means that quality alone is not enough. Direction matters. "
            "Timing matters. Honest self-awareness matters more than any label on a "
            "package.</p>"
            "<p>The question is not whether the food is good. The question is whether it "
            "is serving you well, right here, right now, in the life you are actually "
            "living.</p>"
            "<p>That is a question worth sitting with. It does not shout. It just asks "
            "you to pay attention.</p>"
        ),
    },
    # ------------------------------------------------------------------
    # GYM NEWS
    # ------------------------------------------------------------------
    "gym_news": {
        "items": [
            {
                "heading": "Upcoming Gym Closures",
                "body": (
                    "May 18th Full Closure. Additional dates available from "
                    '<a href="https://crawford-coaching.ca/assistant">my assistant</a> '
                    'or check <a href="https://calendar.google.com/calendar/u/0?cid=Y2IzMzFlODQzY2E4ZTI0M2NiNGMzN2VmZDNiMjdkYWE5OWY0OWM0NTY2MTEzYjAxODBiMGFlZmE3MDZmZDNkMEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t">my calendar</a>.'
                ),
            },
            {
                "heading": "New Interval Timer",
                "body": (
                    "The interval timer I built for use in my gym is now available for "
                    "you to use in the gym on your phone, or at home whenever. "
                    "It is highly configurable, but has some quick preset options, and "
                    "also now a workout builder \u2013 just choose from a few options to "
                    "tell it what time and equipment you have, and it will build you a "
                    "quick EMOM (every minute on the minute) workout \u2013 no decision "
                    "fatigue!"
                ),
                # --- not yet supported by renderer — image per gym item ---
                "image": "newsletters/15-becoming-a-snacker/timer.png",
                "image_alt": "Synergize Interval Timer showing an EMOM workout",
            },
        ],
        "cta_label": "Try the Timer",
        "cta_url": "https://crawford-coaching.ca/timer",
    },
    # ------------------------------------------------------------------
    # LOCAL NEWS
    # ------------------------------------------------------------------
    "local_news": {
        "subtitle": "Upcoming Performance",
        # --- not yet supported by renderer — image in local news ---
        "image": "newsletters/15-becoming-a-snacker/ten.png",
        "image_alt": "Voices Rock TEN concert graphic",
        "body": (
            "<p>Turn it up! Voices Rock is celebrating 10 years of making epic choral "
            "music. Join Voices Rock Medicine (Kingston) and special guests The Gertrudes "
            "for a high-energy concert featuring some of their favourite arrangements from "
            "the past decade. With rock classics by The Beatles, Pat Benatar, The Mamas "
            "&amp; The Papas, and more, this celebration promises big harmonies, great "
            "vibes, and unforgettable music you won\u2019t want to miss. There may be some "
            "Synergize Group Fitness members in the ensemble!</p>"
            '<p><a href="https://www.kingstongrand.ca/events/ten">Get your tickets here!</a></p>'
        ),
    },
}
