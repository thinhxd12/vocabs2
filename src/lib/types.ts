/** One row of `bookmark_table`: a saved Kindle highlight. */
export type Highlight = {
	id: string;
	authors: string;
	bookTile: string;
	content: string;
	dateOfCreation: string;
	like: number;
	location: string;
	page: number;
	type: string;
	note: string;
};

/** The slice of a book's catalogue record the info page can show. */
export type BookDetail = {
	title: string | null;
	authors: string[];
	coverImage: string | null;
	rating: string | null;
	numberOfRatings: string | null;
	numberOfReviews: string | null;
	series: string | null;
	genres: string[];
	description: string | null;
	firstPublished: string | null;
	numberOfPages: string | null;
};

/** One painting from DailyArt: the image plus the magazine's caption. */
export type ArtImage = {
	mainImage: string;
	shareDate: string;
	title: string;
	attr: string;
	authorImage: string;
	author: string;
	authorYears: string;
	/** The caption, one string per paragraph. Plain text, never markup. */
	content: string[];
};

/** One flip page: the text printed on its two sides. */
export type BookPageContent = {
	id: number;
	flip: boolean;
	front: string;
	back: string;
};
