const pressed = (...keys) => Object.freeze({ mode: 'press', keys: Object.freeze(keys) });
const held = (...keys) => Object.freeze({ mode: 'hold', keys: Object.freeze(keys) });
const axis = (negative, positive) => Object.freeze({
    negative: Object.freeze(negative),
    positive: Object.freeze(positive),
});

export const INPUT_CONTEXTS = Object.freeze({
    MENU: Object.freeze({
        actions: Object.freeze({
            confirm: pressed('enter', 'space', 'confirm'),
            cancel: pressed('escape', 'cancel'),
        }),
    }),

    OPEN_WORLD: Object.freeze({
        axes: Object.freeze({
            x: axis(['a', 'arrowleft', 'left'], ['d', 'arrowright', 'right']),
            z: axis(['w', 'arrowup', 'up'], ['s', 'arrowdown', 'down']),
        }),
        analog: Object.freeze({
            xAxis: 'x',
            zAxis: 'z',
            autoSprintAction: 'run',
            autoSprintThreshold: 0.9,
        }),
        actions: Object.freeze({
            run: held('shift', 'run'),
            jump: pressed('space', 'jump'),
            jumpHeld: held('space', 'jumpHeld'),
            celebrate: pressed('o', 'celebrate'),
            ability: pressed('q', 'ability'),
            slide: pressed('g', 'slide'),
            dash: pressed('x', 'dash'),
            dodge: pressed('c', 'dodge'),
            wave: pressed('v', 'wave'),
            speak: pressed('h', 'speak'),
            interact: pressed('enter', 'interact'),
            toggleMap: pressed('m', 'map'),
            quickSave: pressed('f6', 'quickSave'),
            pause: pressed('escape', 'pause'),
        }),
    }),



    ROLE_PLAY: Object.freeze({
        axes: Object.freeze({
            x: axis(['a', 'arrowleft', 'left'], ['d', 'arrowright', 'right']),
            z: axis(['w', 'arrowup', 'up'], ['s', 'arrowdown', 'down']),
        }),
        analog: Object.freeze({
            xAxis: 'x', zAxis: 'z', autoSprintAction: 'run', autoSprintThreshold: 0.9,
        }),
        actions: Object.freeze({
            run: held('shift', 'run'),
            interact: pressed('enter', 'e', 'interact'),
            toggleInventory: pressed('i', 'toggleInventory'),
            toggleQuests: pressed('j', 'toggleQuests'),
            cancelDialogue: pressed('escape', 'cancelDialogue'),
            pause: pressed('p', 'pause'),
        }),
    }),

    EVENT: Object.freeze({
        axes: Object.freeze({
            x: axis(['a', 'arrowleft', 'left'], ['d', 'arrowright', 'right']),
            z: axis(['w', 'arrowup', 'up'], ['s', 'arrowdown', 'down']),
        }),
        analog: Object.freeze({
            xAxis: 'x',
            zAxis: 'z',
            autoSprintAction: 'run',
            autoSprintThreshold: 0.9,
        }),
        actions: Object.freeze({
            run: held('shift', 'run'),
            eventAction: pressed('space', 'e', 'eventAction'),
            interact: pressed('enter', 'interact'),
            pause: pressed('escape', 'pause'),
        }),
    }),

    HIDE_AND_SEEK: Object.freeze({
        axes: Object.freeze({
            x: axis(['a', 'arrowleft', 'left'], ['d', 'arrowright', 'right']),
            z: axis(['w', 'arrowup', 'up'], ['s', 'arrowdown', 'down']),
        }),
        analog: Object.freeze({
            xAxis: 'x',
            zAxis: 'z',
            autoSprintAction: 'run',
            autoSprintThreshold: 0.9,
        }),
        actions: Object.freeze({
            run: held('shift', 'run'),
            interact: pressed('enter', 'e', 'interact'),
            revealPulse: pressed('r', 'revealPulse'),
            pause: pressed('escape', 'pause'),
        }),
    }),


    ARCADE: Object.freeze({
        axes: Object.freeze({
            x: axis(['a', 'arrowleft', 'left'], ['d', 'arrowright', 'right']),
            z: axis(['w', 'arrowup', 'up'], ['s', 'arrowdown', 'down']),
        }),
        analog: Object.freeze({
            xAxis: 'x',
            zAxis: 'z',
            autoSprintAction: 'run',
            autoSprintThreshold: 0.9,
        }),
        actions: Object.freeze({
            run: held('shift', 'run'),
            jump: pressed('space', 'jump'),
            dash: pressed('x', 'dash'),
            interact: pressed('enter', 'e', 'interact'),
            pause: pressed('escape', 'pause'),
        }),
    }),

    DINO_RUN: Object.freeze({
        actions: Object.freeze({
            jump: pressed('space', 'arrowup', 'jump'),
            jumpHeld: held('space', 'arrowup', 'jumpHeld'),
            duck: held('arrowdown', 's', 'duck', 'slide'),
            pause: pressed('escape', 'pause'),
        }),
    }),

    TETRIS: Object.freeze({
        actions: Object.freeze({
            moveLeft: held('arrowleft', 'a', 'left'),
            moveRight: held('arrowright', 'd', 'right'),
            softDrop: held('arrowdown', 's', 'softDrop'),
            hardDrop: pressed('space', 'hardDrop'),
            rotateClockwise: pressed('arrowup', 'x', 'rotateClockwise'),
            rotateCounterClockwise: pressed('z', 'rotateCounterClockwise'),
            hold: pressed('c', 'hold'),
            pause: pressed('escape', 'pause'),
        }),
    }),

    PAUSE: Object.freeze({
        actions: Object.freeze({
            resume: pressed('escape', 'enter', 'resume'),
            cancel: pressed('cancel'),
        }),
    }),
});
