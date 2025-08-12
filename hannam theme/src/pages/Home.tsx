import ContactUs from "../components/FrontPage/ContactUs";
import Cta from "../components/FrontPage/Cta";
import Faq from "../components/FrontPage/FaqContent";
import KeyFeatures from "../components/FrontPage/KeyFeatures";
import Footer from "../components/FrontPage/Footer";
import HeroBanner from "../components/FrontPage/HeroBanner";
import LightDarkModeButton from "../components/FrontPage/LightDarkModeButton";
import Navbar from "../components/FrontPage/Navbar";
import OurTeam from "../components/FrontPage/OurTeam";
import Testimonials from "../components/FrontPage/Testimonials";
import Widgets from "../components/FrontPage/Widgets";

const Home = () => {
  return (
    <>
      <div className="front-page-body overflow-hidden">
        <LightDarkModeButton />

        <Navbar />

        <HeroBanner />

        <KeyFeatures />

        <Widgets />

        <Testimonials />

        <OurTeam />

        <Faq />

        <ContactUs />

        <Cta />

        <Footer />
      </div>
    </>
  );
};

export default Home;
