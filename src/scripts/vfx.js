/**
 * VFX4e - Visual effects utility class with power source theming
 *
 * Provides standardized visual effects with customizable power sources (Fire, Lightning, Divine, etc.)
 * All methods support either a power source string or a custom configuration object
 */
class VFX4e {
    /**
     * Power source theme configurations
     * Each theme defines default visual effect files for different effect types
     */
    static PowerSources = {
        FIRE: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Red_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_Orange_400x400.webm',
            teleport: { color: 'orange', beam: 'jb2a.chain_lightning.secondary.orange' },
            impact: 'jb2a.fireball.beam.orange',
            beam: 'jb2a.fire_bolt.orange'
        },
        LIGHTNING: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Blue_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_Blue_400x400.webm',
            teleport: { color: 'blue', beam: 'jb2a.chain_lightning.secondary.blue' },
            impact: 'jb2a.lightning_strike.blue',
            beam: 'jb2a.chain_lightning.secondary.blue'
        },
        WATER: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_BlueGreen_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_BlueGreen_400x400.webm',
            teleport: { color: 'blue', beam: 'jb2a.static_electricity.01.blue' },
            impact: 'jb2a.impact.water.01.blue',
            beam: 'jb2a.water_jet.blue'
        },
        DIVINE: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Yellow_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_Yellow_400x400.webm',
            teleport: { color: 'yellow', beam: 'jb2a.energy_strands.range.standard.yellow' },
            impact: 'jb2a.divine_smite.caster.yellowwhite',
            beam: 'jb2a.energy_strands.range.standard.yellow'
        },
        NATURE: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Green_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_GreenYellow_400x400.webm',
            teleport: { color: 'green', beam: 'jb2a.chain_lightning.secondary.green' },
            impact: 'jb2a.impact.ground_crack.green',
            beam: 'jb2a.chain_lightning.secondary.green'
        },
        NECROTIC: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Purple_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_Purple_400x400.webm',
            teleport: { color: 'purple', beam: 'jb2a.energy_strands.range.standard.purple' },
            impact: 'jb2a.impact.ground_crack.purple',
            beam: 'jb2a.energy_strands.range.standard.purple'
        },
        RADIANT: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Yellow_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_Yellow_400x400.webm',
            teleport: { color: 'yellow', beam: 'jb2a.energy_strands.range.standard.yellow' },
            impact: 'jb2a.divine_smite.caster.yellowwhite',
            beam: 'jb2a.ray_of_frost.yellow'
        },
        ARCANE: {
            healing: 'modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Blue_400x400.webm',
            aura: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_Blue_400x400.webm',
            teleport: { color: 'blue', beam: 'jb2a.chain_lightning.secondary.blue' },
            impact: 'jb2a.magic_signs.rune.abjuration.intro.blue',
            beam: 'jb2a.eldritch_blast.blue'
        }
    };

    /**
     * Play a healing visual effect
     *
     * @param {Character | Token} target Character or token receiving healing
     * @param {string | Object} options Power source name ('FIRE', 'DIVINE', etc.) or custom config
     * @param {string} [options.file] Custom effect file path
     * @param {number} [options.scale=0.5] Effect scale
     * @param {number} [options.duration] Effect duration in ms
     * @returns {Promise<void>}
     */
    static async healing(target, options = 'DIVINE') {
        const token = target.token || target;
        const config = this._resolveConfig(options, 'healing', {
            scale: 0.5
        });

        return new Sequence()
            .effect(config.file)
            .atLocation(token)
            .scale(config.scale)
            .play();
    }

    /**
     * Play a teleportation visual effect
     *
     * @param {Character | Token} character Character or token teleporting
     * @param {Object} targetLocation Target location with x, y coordinates or origin property
     * @param {string | Object} options Power source name or custom config
     * @param {string} [options.color='blue'] Color theme for arrival effect
     * @param {string} [options.beam] Beam/link effect file connecting origin and destination
     * @param {boolean} [options.useBeam=true] Whether to show beam effect linking the two squares
     * @param {number} [options.fadeIn=50] Fade in duration for departure
     * @param {number} [options.duration=550] Effect duration
     * @param {number} [options.fadeOut=250] Fade out duration for departure
     * @returns {Promise<void>}
     */
    static async teleport(character, targetLocation, options = 'LIGHTNING') {
        const token = character.token || character;
        const config = this._resolveConfig(options, 'teleport', {
            color: 'blue',
            beam: 'jb2a.chain_lightning.secondary.blue',
            useBeam: true,
            fadeIn: 50,
            duration: 550,
            fadeOut: 250
        });

        const destination = targetLocation.origin || targetLocation;

        const sequence = new Sequence()
            .effect()
                .from(token)
                .fadeIn(config.fadeIn)
                .duration(config.duration)
                .fadeOut(config.fadeOut)
                .filter("Blur")
                .elevation(0);

        if (config.useBeam && config.beam) {
            sequence
                .effect()
                    .file(config.beam)
                    .atLocation(token)
                    .stretchTo(destination)
                    .elevation(0);
        }

        return sequence
            .wait(100)
            .animation()
                .on(token)
                .teleportTo(destination)
                .snapToGrid()
                .waitUntilFinished()
            .effect()
                .file(`jb2a.static_electricity.03.${config.color}`)
                .atLocation(token)
                .scaleToObject()
            .play();
    }

    /**
     * Play an aura visual effect
     *
     * @param {Character | Token} target Character or token with aura
     * @param {string | Object} options Power source name or custom config
     * @param {string} [options.file] Custom effect file
     * @param {number} [options.scale=0.5] Effect scale
     * @param {number} [options.duration=2000] Effect duration in ms
     * @param {number} [options.fadeIn=500] Fade in duration
     * @param {number} [options.fadeOut=500] Fade out duration
     * @param {boolean} [options.belowTokens=true] Whether to render below tokens
     * @returns {Promise<void>}
     */
    static async aura(target, options = 'NATURE') {
        const token = target.token || target;
        const config = this._resolveConfig(options, 'aura', {
            scale: 0.5,
            duration: 2000,
            fadeIn: 500,
            fadeOut: 500,
            belowTokens: true
        });

        const sequence = new Sequence()
            .effect(config.file)
            .atLocation(token)
            .scale(config.scale)
            .fadeIn(config.fadeIn, { ease: "easeOutCubic", delay: 200 })
            .fadeOut(config.fadeOut)
            .duration(config.duration);

        if (config.belowTokens) {
            sequence.belowTokens();
        }

        return sequence.play();
    }

    /**
     * Play a custom effect from a file
     *
     * @param {string} file Path to effect file
     * @param {Character | Token} target Character or token to play effect on
     * @param {Object} [options={}] Effect options
     * @param {number} [options.scale=0.5] Effect scale
     * @param {number} [options.fadeIn=500] Fade in duration
     * @param {number} [options.fadeOut=1000] Fade out duration
     * @param {number} [options.duration=2500] Effect duration
     * @param {boolean} [options.belowTokens=false] Whether to render below tokens
     * @returns {Promise<void>}
     */
    static async custom(file, target, options = {}) {
        const token = target.token || target;
        const {
            scale = 0.5,
            fadeIn = 500,
            fadeOut = 1000,
            duration = 2500,
            belowTokens = false
        } = options;

        const sequence = new Sequence()
            .effect(file)
            .atLocation(token)
            .scale(scale)
            .fadeIn(fadeIn, { ease: "easeOutCubic", delay: 200 })
            .duration(duration)
            .fadeOut(fadeOut, { ease: "easeOutCubic", delay: 200 });

        if (belowTokens) {
            sequence.belowTokens();
        }

        return sequence.play();
    }

    /**
     * Play an impact/hit visual effect
     *
     * @param {Character | Token} target Character or token being hit
     * @param {string | Object} options Power source name or custom config
     * @param {string} [options.file] Custom effect file
     * @param {number} [options.scale=1.0] Effect scale
     * @returns {Promise<void>}
     */
    static async impact(target, options = 'FIRE') {
        const token = target.token || target;
        const config = this._resolveConfig(options, 'impact', {
            scale: 1.0
        });

        return new Sequence()
            .effect(config.file)
            .atLocation(token)
            .scale(config.scale)
            .play();
    }

    /**
     * Play a beam effect that stretches between two points
     * Used for rays, lightning chains, ranged attacks, etc.
     *
     * @param {Character | Token | Object} origin Starting point (Character, Token, or {x, y})
     * @param {Character | Token | Object} target End point (Character, Token, or {x, y})
     * @param {string | Object} options Power source name or custom config
     * @param {string} [options.file] Custom beam effect file
     * @param {number} [options.scale=1.0] Effect scale
     * @param {number} [options.duration] Effect duration in ms
     * @param {number} [options.fadeIn] Fade in duration
     * @param {number} [options.fadeOut] Fade out duration
     * @returns {Promise<void>}
     */
    static async beam(origin, target, options = 'LIGHTNING') {
        // Resolve origin location
        const originToken = origin.token || origin;
        const originLocation = originToken.x !== undefined ? originToken : origin;

        // Resolve target location
        const targetToken = target.token || target;
        const targetLocation = targetToken.x !== undefined ? targetToken : target;

        const config = this._resolveConfig(options, 'beam', {
            file: 'jb2a.chain_lightning.secondary.blue',
            scale: 1.0
        });

        const sequence = new Sequence()
            .effect()
                .file(config.file)
                .atLocation(originLocation)
                .stretchTo(targetLocation)
                .scale(config.scale);

        if (config.duration) {
            sequence.duration(config.duration);
        }

        if (config.fadeIn) {
            sequence.fadeIn(config.fadeIn);
        }

        if (config.fadeOut) {
            sequence.fadeOut(config.fadeOut);
        }

        return sequence.play();
    }

    /**
     * Resolve configuration from power source or custom options
     *
     * @private
     * @param {string | Object} options Power source name or custom config
     * @param {string} effectType Type of effect ('healing', 'teleport', etc.)
     * @param {Object} defaults Default values to merge
     * @returns {Object} Resolved configuration
     */
    static _resolveConfig(options, effectType, defaults = {}) {
        if (typeof options === 'string') {
            // Power source name provided
            const powerSource = this.PowerSources[options.toUpperCase()];
            if (!powerSource) {
                console.warn(`Unknown power source: ${options}, using defaults`);
                return defaults;
            }

            const sourceConfig = powerSource[effectType];
            if (typeof sourceConfig === 'string') {
                // Simple file path
                return { ...defaults, file: sourceConfig };
            } else if (typeof sourceConfig === 'object') {
                // Complex configuration
                return { ...defaults, ...sourceConfig };
            }

            console.warn(`No ${effectType} config for power source: ${options}`);
            return defaults;
        } else if (typeof options === 'object') {
            // Custom configuration object
            return { ...defaults, ...options };
        }

        return defaults;
    }
}
