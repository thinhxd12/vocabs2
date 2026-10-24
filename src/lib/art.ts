import mainAuthor from '#lib/assets/images/main-author.webp';
import mainImage from '#lib/assets/images/main-image.webp';
import type { ArtImage } from '#lib/types.ts';

/**
 * The painting shown before DailyArt answers, and whenever the magazine cannot
 * be read. Copied from the old app's default so `/art` never opens empty.
 */
export const DEFAULT_ART: ArtImage = {
	mainImage,
	shareDate: '01 July 2023',
	title: 'The Red Buoy, Saint-Tropez',
	attr: 'Oil on canvas • 81 × 65 cm',
	authorImage: mainAuthor,
	author: 'Paul Signac',
	authorYears: '1895',
	content: [
		'Hello July!',
		'Time for an artist who in my opinion, created one of the best images of Summer ... the French Pointillist, Paul Signac!',
		'Signac was a painter and an avid sailor. He created several marine paintings, including a series of views over the port of Saint-Tropez, where he settled in 1892.',
		"In this vertical painting, the eye initially fixes on the vibrant red-orange buoy, which contrasts with the water's deep blue. The reflections of the buildings then lead the viewer's eye to the background, with lighter tones. The divisionist technique and the combination of pure colors allowed Signac to depict a glittering sea, and the glimmering light of the Midi.",
		"The Pointillist painters differ from the Impressionists, most notably in the scientific dimension of their work. Regarding the rigor of his initial work, Signac's strokes have widened for this series; the division of tones is more relaxed.",
		'P.S. Our sale is on! Save 20% on our Prints Collection and order a high-quality reproduction of the greatest masterpieces.'
	]
};
