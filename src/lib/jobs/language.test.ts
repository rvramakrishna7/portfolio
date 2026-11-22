import { describe, it, expect } from "vitest";
import { detectLanguage } from "./language";

describe("Language Filter (detectLanguage)", () => {
  it("detects full Dutch job ad", () => {
    const text =
      "Wij zijn op zoek naar een enthousiaste software engineer voor ons team. In deze functie ga je werken aan innovatieve oplossingen met moderne technologieën. Je hebt ervaring met TypeScript en Node.js. Samen met het team ontwikkel je schaalbare systemen die het verschil maken voor onze klanten.";
    const res = detectLanguage("Software Engineer", text);
    expect(res.language).toBe("Dutch");
  });

  it("detects full German job ad", () => {
    const text =
      "Wir suchen einen engagierten Softwareentwickler für unser Team. In dieser Position arbeiten Sie an modernen Webanwendungen mit React und Node.js. Wir bieten flexible Arbeitszeiten und ein motiviertes Team, das sich auf Ihre Bewerbung freut.";
    const res = detectLanguage("Softwareentwickler", text);
    expect(res.language).toBe("German");
  });

  it("detects full French job ad", () => {
    const text =
      "Nous recherchons un développeur full stack pour rejoindre notre équipe à distance. Vous travaillerez sur la conception et le développement de nos applications web avec TypeScript, React et Node.js dans un environnement agile.";
    const res = detectLanguage("Développeur Full Stack", text);
    expect(res.language).toBe("French");
  });

  it("detects full Spanish job ad", () => {
    const text =
      "Estamos buscando un desarrollador frontend para nuestro equipo internacional. En este puesto vas a trabajar con React y TypeScript para crear experiencias increíbles para nuestros usuarios con las mejores prácticas del sector.";
    const res = detectLanguage("Desarrollador Frontend", text);
    expect(res.language).toBe("Spanish");
  });

  it("detects full Portuguese job ad", () => {
    const text =
      "Estamos à procura de um desenvolvedor backend para a nossa equipa. Você irá trabalhar com Node.js e PostgreSQL para desenvolver APIs seguras e escaláveis. Se você tem paixão por tecnologia venha fazer parte do nosso time.";
    const res = detectLanguage("Desenvolvedor Backend", text);
    expect(res.language).toBe("Portuguese");
  });

  it("detects full Italian job ad", () => {
    const text =
      "Siamo alla ricerca di uno sviluppatore software per il nostro team di ingegneria. In questo ruolo lavorerai con noi per sviluppare soluzioni scalabili e performanti utilizzando le più recenti tecnologie cloud e moderne.";
    const res = detectLanguage("Sviluppatore Software", text);
    expect(res.language).toBe("Italian");
  });

  it("detects non-Latin script (Devanagari, CJK, Cyrillic)", () => {
    const cjkText =
      "ソフトウェアエンジニアを募集しています。東京オフィスまたはフルリモートでの勤務が可能です。最新のクラウド技術を活用した開発を行っています。チームメンバーと協力しながら高品質な製品を構築してください。";
    const resCjk = detectLanguage("ソフトウェアエンジニア", cjkText);
    expect(resCjk.language).toBe("non-latin");

    const cyrillicText =
      "Мы ищем опытного инженера-программиста для работы над нашими облачными сервисами с использованием TypeScript и Node.js. Присоединяйтесь к нашей распределенной команде.";
    const resCyr = detectLanguage("Инженер-программист", cyrillicText);
    expect(resCyr.language).toBe("non-latin");
  });

  it("keeps English ad with a few foreign words as English", () => {
    const text =
      "We are looking for a Senior Software Engineer to join our core backend team in our Zurich office. Our architecture is built with Node.js and TypeScript, serving as our 'de facto' standard across European and Mumbai hubs.";
    const res = detectLanguage("Senior Software Engineer", text);
    expect(res.language).toBe("English");
  });

  it("keeps short English description under 40 words as English", () => {
    const text = "Looking for a TypeScript and React developer for a fast-paced role. Remote worldwide.";
    const res = detectLanguage("Frontend Engineer", text);
    expect(res.language).toBe("English");
  });

  it("keeps empty description as English (does not hide)", () => {
    const res = detectLanguage("Backend Engineer", "");
    expect(res.language).toBe("English");
  });

  it("classifies typical English remote job description cleanly as English", () => {
    const text =
      "We are looking for a Full Stack Developer to build world-class cloud products with React, Next.js, and Python. You will collaborate with product designers and backend engineers to deploy high-throughput services.";
    const res = detectLanguage("Full Stack Developer", text);
    expect(res.language).toBe("English");
  });

  it("detects mixed English title with predominantly German description", () => {
    const text =
      "Als Softwareentwickler bei uns arbeiten Sie mit modernen Web-Technologien. Wir suchen Verstärkung für unser Team in Berlin. Sie bringen Erfahrung mit und haben Lust auf spannende Projekte in einem agilen Umfeld mit flexiblen Arbeitszeiten.";
    const res = detectLanguage("Full Stack Developer", text);
    expect(res.language).toBe("German");
  });

  it("detects mixed English title with predominantly Dutch description", () => {
    const text =
      "Voor onze vestiging in Amsterdam zoeken wij een enthousiaste developer die ons team komt versterken. Je gaat werken aan uitdagende applicaties voor toonaangevende klanten in Nederland en België met veel eigen inbreng.";
    const res = detectLanguage("Lead Developer", text);
    expect(res.language).toBe("Dutch");
  });

  it("detects mixed English title with predominantly French description", () => {
    const text =
      "Pour accompagner notre croissance nous recherchons un ingénieur études et développement. Vous participerez à la conception technique et à la réalisation de nos solutions logicielles avec une équipe passionnée.";
    const res = detectLanguage("Cloud Architect", text);
    expect(res.language).toBe("French");
  });

  it("detects non-Latin Arabic script", () => {
    const text =
      "نحن نبحث عن مهندس برمجيات موهوب للانضمام إلى فريقنا التقني للعمل عن بعد في تطوير التطبيقات السحابية الحديثة.";
    const res = detectLanguage("مهندس برمجيات", text);
    expect(res.language).toBe("non-latin");
  });

  it("detects non-Latin Devanagari script", () => {
    const text =
      "हम अपनी टीम के लिए एक कुशल सॉफ्टवेयर इंजीनियर की तलाश कर रहे हैं जो आधुनिक वेब अनुप्रयोगों के विकास में योगदान दे सके।";
    const res = detectLanguage("सॉफ्टवेयर इंजीनियर", text);
    expect(res.language).toBe("non-latin");
  });
});
