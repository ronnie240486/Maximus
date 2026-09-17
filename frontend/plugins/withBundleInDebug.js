const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Por padrão, o build "debug" do React Native/Expo NÃO empacota o bundle
 * JS dentro do APK — ele espera achar um Metro bundler rodando (só faz
 * sentido em desenvolvimento, com o celular ligado no PC). Um APK "debug"
 * instalado sozinho numa TV box/celular (sem Metro por perto) fica preso
 * na splash screen pra sempre, porque o app nunca consegue carregar o
 * JavaScript.
 *
 * `debuggableVariants = []` diz pro plugin do React Native que NENHUMA
 * variante deve pular o empacotamento — ou seja, o "debug" passa a
 * empacotar o JS igual um build de produção (só sem otimizar/assinar pra
 * loja), virando um APK que funciona sozinho, sem precisar de nada rodando
 * no computador. Isso precisa ser um config plugin (em vez de editar
 * android/app/build.gradle direto) porque esse arquivo é regerado do zero
 * toda vez que `expo prebuild` roda (inclusive no CI do GitHub Actions).
 */
module.exports = function withBundleInDebug(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy' && !config.modResults.contents.includes('debuggableVariants = []')) {
      config.modResults.contents = config.modResults.contents.replace(
        /react\s*\{/,
        'react {\n    debuggableVariants = []\n',
      );
    }
    return config;
  });
};
