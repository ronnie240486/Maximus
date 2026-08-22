# Build do Maximus Player Mobile

Esta branch é a **versão mobile baseada na fonte do APK funcional**, com o filtro global de conteúdo adulto e os assets corretos de marca. Ela não é a fonte da TV Box.

## Configuração no EAS Studio

Use exatamente os valores abaixo:

| Campo | Valor |
|---|---|
| Repositório | `ronnie240486/Maximus` |
| Branch | `maximus-mobile-sem-adultos` |
| Base directory | `.` |
| Plataforma | Android |
| Perfil | `preview` |
| Tipo de saída | APK |
| Nome do aplicativo | `Maximus Player` |
| Application ID | `com.interactiveplayer.app` |
| New Architecture | Ativa |

Não selecione `ronnie240486/maximus-player-tvbox`, não use a branch `main` da TV Box e não substitua o bundle JavaScript/Hermes dentro da APK de referência.

O perfil `preview` está configurado em `eas.json` como distribuição interna e saída APK. O logo e o fundo recebidos do painel continuam tendo prioridade no aplicativo; os assets locais servem apenas como fallback e splash.

## Validação obrigatória do APK gerado

Antes de instalar ou enviar o APK, confirme:

```bash
aapt dump badging app-release.apk | grep -E "package:|application-label"
```

O resultado deve conter:

```text
package: name='com.interactiveplayer.app'
application-label:'Maximus Player'
```

A APK de referência usada como identidade é `MaximusPlayer-icon-completo-original-player-signed.apk`, versionCode 2, versionName 1.0.0. Uma recompilação legítima terá hash de arquivo diferente, mas deve vir desta branch e manter o mesmo pacote, nome, telas, player e arquitetura nova.
