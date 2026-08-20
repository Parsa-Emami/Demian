<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreCharacterRequest extends FormRequest
{
    /**
     * Determine whether the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'max:80',
            ],

            'slug' => [
                'required',
                'alpha_dash:ascii',
                'max:100',
                Rule::unique('characters', 'slug'),
            ],

            'sprite_sheet' => [
                'required',
                'file',
                'image',
                'mimes:png,webp',
                'max:10240',
            ],

            'atlas' => [
                'required',
                'file',
                'mimes:json,txt',
                'max:1024',
            ],

            'settings' => [
                'nullable',
                'json',
            ],
        ];
    }

    /**
     * Perform semantic validation after Laravel's basic rules pass.
     *
     * The game requires a usable atlas, not merely a file with a .json
     * extension. This validation prevents incomplete or malformed character
     * packs from reaching CharacterController::store().
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->has('atlas')) {
                    return;
                }

                $file = $this->file('atlas');

                if ($file === null || !$file->isValid()) {
                    return;
                }

                $contents = file_get_contents($file->getRealPath());

                if ($contents === false || trim($contents) === '') {
                    $validator->errors()->add(
                        'atlas',
                        'The atlas file is empty or unreadable.'
                    );

                    return;
                }

                $atlas = json_decode($contents, true);

                if (!is_array($atlas) || json_last_error() !== JSON_ERROR_NONE) {
                    $validator->errors()->add(
                        'atlas',
                        'The atlas file must contain valid JSON.'
                    );

                    return;
                }

                /*
                 * Meta
                 */
                $meta = $atlas['meta'] ?? null;

                if (!is_array($meta)) {
                    $validator->errors()->add(
                        'atlas',
                        'The atlas must contain a meta object.'
                    );
                } else {
                    $size = $meta['size'] ?? null;

                    if (!is_array($size)) {
                        $validator->errors()->add(
                            'atlas',
                            'The atlas meta object must contain a size object.'
                        );
                    } else {
                        $width = $size['w'] ?? null;
                        $height = $size['h'] ?? null;

                        if (
                            !is_numeric($width) ||
                            !is_numeric($height) ||
                            (int) $width <= 0 ||
                            (int) $height <= 0
                        ) {
                            $validator->errors()->add(
                                'atlas',
                                'The atlas size must contain positive numeric w and h values.'
                            );
                        }
                    }
                }

                /*
                 * Frames
                 */
                $frames = $atlas['frames'] ?? null;

                if (!is_array($frames) || $frames === []) {
                    $validator->errors()->add(
                        'atlas',
                        'The atlas must contain at least one sprite frame.'
                    );
                } else {
                    foreach ($frames as $frameName => $frame) {
                        if (!is_array($frame)) {
                            $validator->errors()->add(
                                'atlas',
                                "Frame [{$frameName}] must be an object."
                            );

                            continue;
                        }

                        foreach (['x', 'y', 'w', 'h'] as $key) {
                            if (!array_key_exists($key, $frame)) {
                                $validator->errors()->add(
                                    'atlas',
                                    "Frame [{$frameName}] is missing [{$key}]."
                                );

                                continue 2;
                            }

                            if (!is_numeric($frame[$key])) {
                                $validator->errors()->add(
                                    'atlas',
                                    "Frame [{$frameName}].{$key} must be numeric."
                                );

                                continue 2;
                            }
                        }

                        $x = (int) $frame['x'];
                        $y = (int) $frame['y'];
                        $w = (int) $frame['w'];
                        $h = (int) $frame['h'];

                        if ($x < 0 || $y < 0 || $w <= 0 || $h <= 0) {
                            $validator->errors()->add(
                                'atlas',
                                "Frame [{$frameName}] contains invalid coordinates or dimensions."
                            );
                        }
                    }
                }

                /*
                 * Animations
                 *
                 * Combat animations such as "attack" are intentionally not
                 * required. The current Demian character contract removes /
                 * sanitizes combat animation names.
                 */
                $animations = $atlas['animations'] ?? null;

                if (!is_array($animations) || $animations === []) {
                    $validator->errors()->add(
                        'atlas',
                        'The atlas must contain animations.'
                    );

                    return;
                }

                $requiredAnimations = [
                    'idle',
                    'walk',
                    'run',
                    'jump',
                    'win',
                ];

                foreach ($requiredAnimations as $animationName) {
                    if (!array_key_exists($animationName, $animations)) {
                        $validator->errors()->add(
                            'atlas',
                            "The atlas is missing required animation [{$animationName}]."
                        );

                        continue;
                    }

                    $animation = $animations[$animationName];

                    if (!is_array($animation)) {
                        $validator->errors()->add(
                            'atlas',
                            "Animation [{$animationName}] must be an object."
                        );

                        continue;
                    }

                    /*
                     * Demian supports both:
                     *
                     * frames: [...]
                     *
                     * and directional packs:
                     * framesRight / framesLeft / framesByDirection
                     */
                    $hasFrames =
                        isset($animation['frames']) &&
                        is_array($animation['frames']) &&
                        $animation['frames'] !== [];

                    $hasFramesRight =
                        isset($animation['framesRight']) &&
                        is_array($animation['framesRight']) &&
                        $animation['framesRight'] !== [];

                    $hasFramesLeft =
                        isset($animation['framesLeft']) &&
                        is_array($animation['framesLeft']) &&
                        $animation['framesLeft'] !== [];

                    $hasDirectionalFrames =
                        isset($animation['framesByDirection']) &&
                        is_array($animation['framesByDirection']) &&
                        $animation['framesByDirection'] !== [];

                    if (
                        !$hasFrames &&
                        !$hasFramesRight &&
                        !$hasFramesLeft &&
                        !$hasDirectionalFrames
                    ) {
                        $validator->errors()->add(
                            'atlas',
                            "Animation [{$animationName}] must contain at least one frame."
                        );
                    }
                }

                /*
                 * Validate references to known frame names.
                 */
                if (is_array($frames) && $frames !== []) {
                    $knownFrames = array_fill_keys(
                        array_keys($frames),
                        true
                    );

                    foreach ($animations as $animationName => $animation) {
                        if (!is_array($animation)) {
                            continue;
                        }

                        foreach (
                            ['frames', 'framesRight', 'framesLeft']
                            as $frameListKey
                        ) {
                            $frameList = $animation[$frameListKey] ?? null;

                            if (!is_array($frameList)) {
                                continue;
                            }

                            foreach ($frameList as $frameName) {
                                if (
                                    !is_string($frameName) ||
                                    !isset($knownFrames[$frameName])
                                ) {
                                    $validator->errors()->add(
                                        'atlas',
                                        "Animation [{$animationName}] references unknown frame [{$frameName}]."
                                    );
                                }
                            }
                        }

                        $framesByDirection =
                            $animation['framesByDirection'] ?? null;

                        if (!is_array($framesByDirection)) {
                            continue;
                        }

                        foreach (
                            $framesByDirection as $direction => $frameList
                        ) {
                            if (!is_array($frameList)) {
                                $validator->errors()->add(
                                    'atlas',
                                    "Animation [{$animationName}] direction [{$direction}] must contain a frame list."
                                );

                                continue;
                            }

                            foreach ($frameList as $frameName) {
                                if (
                                    !is_string($frameName) ||
                                    !isset($knownFrames[$frameName])
                                ) {
                                    $validator->errors()->add(
                                        'atlas',
                                        "Animation [{$animationName}] direction [{$direction}] references unknown frame [{$frameName}]."
                                    );
                                }
                            }
                        }
                    }
                }
            },
        ];
    }
}