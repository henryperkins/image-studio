import React from 'react';
import { Heading, Text, Label, Mono, Numeric } from './typography';

const sampleParagraph = `"Typography is the craft of endowing human language with a durable visual form." — Robert Bringhurst. This paragraph demonstrates oldstyle numerals (2025), proper quotes, an en dash 10–20, and a non‑breaking space: 32 px.`;

export const TypographySpecimen: React.FC = () => {
  return (
    <div className="space-y-12 p-8 max-w-6xl mx-auto">
      <section className="space-y-4">
        <Heading level={1}>Display Heading (H1 Hero)</Heading>
        <Heading level={2}>Section Heading (H2)</Heading>
        <Heading level={3}>Sub Section (H3)</Heading>
        <Heading level={4}>Minor Heading (H4)</Heading>
        <Heading level={5}>Tertiary Heading (H5)</Heading>
        <Heading level={6}>Small Heading (H6)</Heading>
      </section>

      <section className="grid md:grid-cols-2 gap-8">
        <div className="longform space-y-4">
          <Heading level={3}>Longform Serif Body</Heading>
            <p>{sampleParagraph}</p>
            <p className="text-longform">
              Another paragraph using <em>emphasis</em>, <strong>strong weight</strong>, and inline
              <Mono>code()</Mono>. Data like <Numeric>12 345</Numeric> is formatted with tabular numerals when needed.
            </p>
        </div>
        <div className="space-y-4">
          <Heading level={4}>UI Body & Variants</Heading>
          <Text>Base body text with default features.</Text>
          <Text size="sm">Small text (14px) – maintain ≥4.5:1 contrast.</Text>
          <Text size="xs" tone="muted">Caption text (12px) semibold for legibility.</Text>
          <Text numeric>Revenue Q2: <Numeric>$123,456</Numeric></Text>
          <Label>Form Label</Label>
          <Mono>git commit -m "feat: add typography system"</Mono>
        </div>
      </section>

      <section>
        <Heading level={3}>Table / Data</Heading>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-700 text-left">
              <th className="py-2">Metric</th>
              <th className="py-2 text-right">Today</th>
              <th className="py-2 text-right">7‑Day Avg</th>
              <th className="py-2 text-right">Δ%</th>
            </tr>
          </thead>
          <tbody className="font-numeric">
            <tr className="border-b border-neutral-800">
              <td className="py-2">Images Generated</td>
              <td className="py-2 numeric">1,245</td>
              <td className="py-2 numeric">1,102</td>
              <td className="py-2 numeric text-green-400">+12.9%</td>
            </tr>
            <tr className="border-b border-neutral-800">
              <td className="py-2">Failed Jobs</td>
              <td className="py-2 numeric">7</td>
              <td className="py-2 numeric">9</td>
              <td className="py-2 numeric text-green-400">-22.2%</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="space-y-4">
        <Heading level={3}>Forms</Heading>
        <form className="space-y-4 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="prompt" required>Prompt</Label>
            <textarea id="prompt" className="input font-ui text-sm" rows={3} placeholder="Describe your image..." />
            <Text size="xs" tone="muted">Use descriptive adjectives; avoid disallowed terms.</Text>
          </div>
          <div className="space-y-1">
            <Label htmlFor="seed">Seed (optional)</Label>
            <input id="seed" type="number" className="input font-numeric" placeholder="12345" />
          </div>
          <button className="btn btn-primary text-sm small-caps">Generate</button>
        </form>
      </section>

      <section className="space-y-4">
        <Heading level={3}>Code Block</Heading>
        <pre><code>{`function generateImage(prompt: string) {
  return fetch('/api/generate', { method: 'POST', body: JSON.stringify({ prompt }) });
}`}</code></pre>
      </section>

      <section>
        <Heading level={3}>Empty State</Heading>
        <div className="card space-y-2 text-center py-10">
          <Heading level={2} serif>Your gallery is empty</Heading>
          <Text tone="muted">Start by creating your first image. Inspiration awaits.</Text>
          <button className="btn btn-primary small-caps">Create Image</button>
        </div>
      </section>
    </div>
  );
};