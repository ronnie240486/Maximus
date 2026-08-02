import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius } from '@/src/theme';
import { fetchWeather, weatherIcon, weatherLabel, WeatherNow } from '@/src/lib/weather';
import { useIsTV } from '@/src/hooks/useIsTV';

const WEATHER_REFRESH_MS = 20 * 60 * 1000; // clima muda devagar — 20 min está de sobra

/**
 * Relógio + previsão do tempo pra tela principal. A localização vem do
 * GPS/rede do próprio aparelho (pede permissão uma vez); se a pessoa negar
 * ou o aparelho não tiver localização (comum em TV box sem GPS), o relógio
 * continua aparecendo normalmente, só sem o clima.
 */
type Props = {
  /** Versão enxuta pra caber em barras estreitas (ex: topo da Home no
   * celular): esconde a data e o nome da cidade, mostra só hora + ícone +
   * temperatura. */
  compact?: boolean;
};

export default function ClockWeather({ compact = false }: Props) {
  const isTV = useIsTV();
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [weatherDenied, setWeatherDenied] = useState(false);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Relógio: atualiza a cada 30s (não precisa de mais precisão que isso
  // pra um mostrador de HH:mm).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadWeather() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        let finalStatus = status;
        if (finalStatus !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          finalStatus = req.status;
        }
        if (finalStatus !== 'granted') {
          if (mounted) setWeatherDenied(true);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low, // não precisamos de precisão de metro pra clima
        });
        if (!mounted) return;

        const w = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
        if (mounted) setWeather(w);

        // Best-effort: nome da cidade pra exibir. Se o geocoder reverso não
        // estiver disponível no aparelho (comum em TV box sem serviços do
        // Google), a gente simplesmente não mostra nome nenhum — não é
        // crítico, o clima em si já é o que importa.
        try {
          const places = await Location.reverseGeocodeAsync({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          const place = places?.[0];
          if (mounted && place) {
            setCity(place.city || place.subregion || place.region || null);
          }
        } catch {
          // sem nome de cidade, sem problema
        }
      } catch {
        if (mounted) setWeatherDenied(true);
      }
    }

    loadWeather();
    refreshRef.current = setInterval(loadWeather, WEATHER_REFRESH_MS);
    return () => {
      mounted = false;
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, []);

  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const date = now
    .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .replace('.', '');

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, isTV && styles.wrapTV]} testID="clock-weather">
      <View>
        <Text style={[styles.time, compact && styles.timeCompact, isTV && styles.timeTV]}>{time}</Text>
        {!compact && <Text style={[styles.date, isTV && styles.dateTV]}>{date}</Text>}
      </View>

      {weather && !weatherDenied && (
        <View style={[styles.weatherBlock, compact && styles.weatherBlockCompact]}>
          <Ionicons name={weatherIcon(weather.code) as any} size={isTV ? 30 : compact ? 18 : 22} color={colors.accentCyan} />
          <View>
            <Text style={[styles.temp, compact && styles.tempCompact, isTV && styles.tempTV]}>{weather.tempC}°</Text>
            {!compact && !!city && (
              <Text style={[styles.city, isTV && styles.cityTV]} numberOfLines={1}>
                {city}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.darkSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  wrapTV: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.lg },
  wrapCompact: { paddingHorizontal: spacing.sm, paddingVertical: 6, gap: spacing.sm },
  time: { color: colors.white, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeTV: { fontSize: 32 },
  timeCompact: { fontSize: 14 },
  date: { color: colors.textSecondary, fontSize: 11, textTransform: 'capitalize', marginTop: 1 },
  dateTV: { fontSize: 14 },
  weatherBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.darkSurfaceAlt,
    paddingLeft: spacing.md,
  },
  weatherBlockCompact: { gap: 4, paddingLeft: spacing.sm },
  temp: { color: colors.accentCyan, fontSize: 18, fontWeight: '800' },
  tempTV: { fontSize: 26 },
  tempCompact: { fontSize: 13 },
  city: { color: colors.textMuted, fontSize: 11 },
  cityTV: { fontSize: 13 },
});
