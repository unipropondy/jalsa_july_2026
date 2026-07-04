import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Set viewport correctly to prevent scaling/zooming issues in WebView */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: htmlStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const htmlStyles = `
body {
  background-color: #F8F9FA;
  margin: 0;
  padding: 0;
}
`;
