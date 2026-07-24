<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCharacterRequest;
use App\Http\Requests\UpdateCharacterRequest;
use App\Models\Character;
use App\Services\Characters\CharacterAssetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CharacterController extends Controller
{
    public function __construct(
        private readonly CharacterAssetService $assets
    ) {
    }

    public function index(): JsonResponse
    {
        $characters = Character::query()
            ->orderByDesc('is_active')
            ->orderByDesc('is_builtin')
            ->orderBy('name')
            ->get()
            ->map(fn (Character $character) => $character->toStudioArray());

        return response()->json(['data' => $characters]);
    }

    public function store(StoreCharacterRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $paths = $this->assets->store(
            $validated['slug'],
            $request->file('sprite_sheet'),
            $request->file('atlas')
        );

        $character = DB::transaction(function () use ($validated, $paths): Character {
            $hasActiveCharacter = Character::query()->where('is_active', true)->exists();

            return Character::query()->create([
                'name' => $validated['name'],
                'slug' => $validated['slug'],
                ...$paths,
                'is_builtin' => false,
                'is_active' => !$hasActiveCharacter,
                'settings' => isset($validated['settings'])
                    ? json_decode($validated['settings'], true)
                    : [],
            ]);
        });

        return response()->json([
            'message' => 'کاراکتر با موفقیت ساخته شد.',
            'data' => $character->fresh()->toStudioArray(),
        ], 201);
    }

    public function show(Character $character): JsonResponse
    {
        return response()->json(['data' => $character->toStudioArray()]);
    }

    public function update(
        UpdateCharacterRequest $request,
        Character $character
    ): JsonResponse {
        if ($character->is_builtin && ($request->hasFile('sprite_sheet') || $request->hasFile('atlas'))) {
            throw ValidationException::withMessages([
                'character' => 'فایل‌های کاراکتر داخلی تیام قابل جایگزینی نیستند.',
            ]);
        }

        $validated = $request->validated();
        $updates = [];

        foreach (['name', 'slug'] as $field) {
            if (array_key_exists($field, $validated)) {
                $updates[$field] = $validated[$field];
            }
        }

        if (array_key_exists('settings', $validated)) {
            $updates['settings'] = $validated['settings']
                ? json_decode($validated['settings'], true)
                : [];
        }

        $assetUpdates = $this->assets->replace(
            $character,
            $request->file('sprite_sheet'),
            $request->file('atlas')
        );

        $character->update([...$updates, ...$assetUpdates]);

        return response()->json([
            'message' => 'کاراکتر به‌روزرسانی شد.',
            'data' => $character->fresh()->toStudioArray(),
        ]);
    }

    public function activate(Character $character): JsonResponse
    {
        DB::transaction(function () use ($character): void {
            Character::query()
                ->whereKeyNot($character->getKey())
                ->update(['is_active' => false]);

            $character->update(['is_active' => true]);
        });

        return response()->json([
            'message' => 'کاراکتر فعال تغییر کرد.',
            'data' => $character->fresh()->toStudioArray(),
        ]);
    }

    public function destroy(Character $character): JsonResponse
    {
        if ($character->is_builtin) {
            return response()->json([
                'message' => 'کاراکتر داخلی تیام قابل حذف نیست.',
            ], 422);
        }

        DB::transaction(function () use ($character): void {
            $wasActive = $character->is_active;

            $this->assets->delete($character);
            $character->delete();

            if ($wasActive) {
                Character::query()
                    ->orderByDesc('is_builtin')
                    ->orderBy('id')
                    ->first()
                    ?->update(['is_active' => true]);
            }
        });

        return response()->json(['message' => 'کاراکتر حذف شد.']);
    }
}
