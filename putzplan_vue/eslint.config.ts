import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

/**
 * ESLint Flat Config für Vue 3 + TypeScript
 *
 * WICHTIG: TypeScript-Workaround erforderlich!
 *
 * Problem: Das Type-System von @vue/eslint-config-typescript ist sehr restriktiv.
 * Der Type `InfiniteDepthConfigWithExtendsAndVueSupport` akzeptiert nur spezifische
 * Config-Typen, aber `pluginVue.configs['flat/essential']` und `skipFormatting`
 * sind normale ESLint Flat Configs, die nicht kompatibel sind.
 *
 * Lösung:
 * 1. Ignores als separates Config-Object außerhalb von defineConfigWithVueTs()
 * 2. Type-Casting mit `as any` für inkompatible Plugin-Configs
 * 3. eslint-disable-comments um no-explicit-any Regel zu umgehen
 *
 * Hinweis: Dies betrifft NUR die Config-Datei selbst, nicht den App-Code!
 * ESLint funktioniert zur Runtime korrekt, da JavaScript Types ignoriert.
 * Alle Type-Checks für .vue und .ts Files laufen normal.
 */
export default [
  // Global ignores müssen als separates Object definiert werden
  { ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'] },

  ...defineConfigWithVueTs(
    // Type-Cast erforderlich: pluginVue.configs ist FlatConfig[], nicht TsEslintConfigForVue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pluginVue.configs['flat/essential'] as any,

    vueTsConfigs.recommended,

    // Type-Cast erforderlich: skipFormatting ist Config, nicht TsEslintConfigForVue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skipFormatting as any,
  ),

  // Custom rules außerhalb von defineConfigWithVueTs um Type-Issues zu vermeiden
  {
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
]
