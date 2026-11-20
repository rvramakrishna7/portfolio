import { ImageResponse } from "next/og";

export const alt = "Ramakrishna | Full-stack and AI automation developer";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#0b0d10",
          color: "#ece8df",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: "24px",
              color: "#f2b705",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: "28px",
            }}
          >
            Mumbai, India
          </div>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 700,
              color: "#ece8df",
              lineHeight: 1.1,
              marginBottom: "24px",
            }}
          >
            Ramakrishna
          </div>
          <div
            style={{
              fontSize: "32px",
              color: "#ece8df",
              lineHeight: 1.3,
            }}
          >
            Full-stack and AI automation developer
          </div>
        </div>

        <div
          style={{
            display: "flex",
            borderTop: "1px solid #262c35",
            paddingTop: "24px",
            fontSize: "20px",
            color: "#ece8df",
          }}
        >
          Ramakrishna
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
