import { useState } from 'react';

// Tipagem clara para garantir a Manutenibilidade e auto-documentação do código
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number; // Margem de erro em metros (fundamental para a certidão dela)
}

interface GPSState {
  data: LocationData | null;
  error: string | null;
  loading: boolean;
}

export const useHighPrecisionGPS = () => {
  const [gpsState, setGpsState] = useState<GPSState>({
    data: null,
    error: null,
    loading: false,
  });

  const captureLocation = () => {
    // Inicia o estado de carregamento e limpa erros anteriores
    setGpsState((prev) => ({ ...prev, loading: true, error: null }));

    if (!("geolocation" in navigator)) {
      setGpsState({
        data: null,
        error: "Seu navegador ou dispositivo não suporta GPS.",
        loading: false,
      });
      return;
    }

    // A "Mágica" do Spec para o iOS/iPadOS não usar Wi-Fi como base
    const options: PositionOptions = {
      enableHighAccuracy: true, // Força uso do hardware de GPS (Satélite)
      timeout: 15000,           // 15 segundos no máximo (para ela não ficar parada na rua esperando)
      maximumAge: 0,            // 0 cache - Garante que o ponto é de AGORA
    };

    const onSuccess = (position: GeolocationPosition) => {
      setGpsState({
        data: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, 
        },
        error: null,
        loading: false,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      let errorMessage = "Erro desconhecido de GPS.";
      
      // Tratamento semântico dos erros para ela saber o que houve em campo
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Você precisa liberar o acesso ao GPS nos ajustes.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Sinal de GPS fraco ou indisponível no momento.";
          break;
        case error.TIMEOUT:
          errorMessage = "O GPS demorou muito para encontrar o satélite. Tente de novo.";
          break;
      }

      setGpsState({
        data: null,
        error: errorMessage,
        loading: false,
      });
    };

    // Dispara a chamada nativa do navegador
    navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
  };

  return { ...gpsState, captureLocation };
};