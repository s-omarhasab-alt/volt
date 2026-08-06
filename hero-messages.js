document.addEventListener("DOMContentLoaded", () => {
    const messages = [
        "Half your bugs were a missing GND.",
        "You've swapped TX and RX more times than you'll admit.",
        "It's just one LED. It took you four hours.",
        "The multimeter's still in your hand. You haven't noticed.",
        "You know exactly which page the pinout diagram is on.",
        "It looks like a mess. You know where every wire goes.",
        "At 2am, that beep is the only thing agreeing with you.",
        "The clock's louder than the doubt, tonight.",
        "Nobody else could find anything in that drawer.",
        "Real numbers, not garbage characters. Finally.",
        "One misplaced resistor. That's all it took to stop the whole board.",
        "Somewhere in this circuit, one floating pin is lying to you.",
        "A cold solder joint, then the first LED that finally holds.",
        "Before anyone sees it, it's just you, the flux smell, and a silent board.",
        "We hand you silicon and copper. What wakes them up is yours alone.",
        "Others see a mess of wires. You see the exact logic underneath.",
        "The smallest resistor on the board often decides the whole outcome.",
        "Every part you order is really the hours you won't lose debugging.",
        "Silicon is blind and silent — until your wiring gives it a pulse.",
        "Every circuit you finish quietly rewires how you'll build the next one.",
        "Every real project you'll ship started this messy, on a desk like this one.",
        "You rewrote the firmware three times before touching the loose jumper wire.",
        "That pull-up resistor cost two cents. It stole three hours of your sanity.",
        "You touched the microcontroller with your fingertip first—just to check the heat.",
        "Page 84 of a 500-page datasheet held the only sentence that actually mattered.",
        "You checked the pinout diagram five times, then checked it once more just to be sure.",
        "It wasn't a protocol error. You just forgot to set the shared ground.",
        "The first time you soldered a wire, it was a mistake. The second time, it was art.",
        "You know the exact moment when the first LED will blink, even before you power it up.",
        "The smell of flux is the smell of victory, even if no one else can see it.",
        "You held your breath for two seconds, waiting for the magic smoke. It didn't come.",
        "The city went quiet hours ago, but your logic analyzer just locked its trigger.",
        "The faint smell of melting rosin resin is the only signal that you're in the zone.",
        "You said you'd fix one trace. Now the entire board is freshly re-soldered.",
        "The scope trace flattened out, and so did your heart rate.",
        "To anyone else, it’s a tangled mess. To you, every wire has a physical address.",
        "Electrons don't care about your intentions; they only follow the physics you laid down.",
        "That unsorted component tray is chaos to them, but an index to you.",
        "It looks prototype-ugly on the bench, but it’s pure poetry on the oscilloscope.",
        "You don't just lay traces; you quietly convince copper and silicon to talk.",
        "Nobody sees the ten failed revisions hidden behind that single green PCB.",
    ];

    const lineEl = document.getElementById("splashPsychLine");
    if (!lineEl) return;

    const pick = messages[Math.floor(Math.random() * messages.length)];
    lineEl.textContent = pick;
});