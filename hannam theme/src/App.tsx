import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Layout/Header";
import SidebarMenu from "./components/Layout/SidebarMenu";
import Footer from "./components/Layout/Footer";

// Front Pages
import Home from "./pages/Home";
import Features from "./pages/front-pages/Features";
import Team from "./pages/front-pages/Team";
import FpFaq from "./pages/front-pages/FpFaq";
import Contact from "./pages/front-pages/Contact";

// Dashboard
import Ecommerce from "./pages/dashboard/Ecommerce";
import Crm from "./pages/dashboard/Crm";
import ProjectManagement from "./pages/dashboard/ProjectManagement";
import Lms from "./pages/dashboard/Lms";
import HelpDesk from "./pages/dashboard/HelpDesk";
import Analytics from "./pages/dashboard/Analytics";
import Crypto from "./pages/dashboard/Crypto";
import Sales from "./pages/dashboard/Sales";
import Hospital from "./pages/dashboard/Hospital";
import Hrm from "./pages/dashboard/Hrm";
import School from "./pages/dashboard/School";
import CallCenter from "./pages/dashboard/CallCenter";
import Marketing from "./pages/dashboard/Marketing";
import Nft from "./pages/dashboard/Nft";
import Saas from "./pages/dashboard/Saas";
import RealEstate from "./pages/dashboard/RealEstate";
import Shipment from "./pages/dashboard/Shipment";
import Finance from "./pages/dashboard/Finance";
import PosSystem from "./pages/dashboard/PosSystem";
import Podcast from "./pages/dashboard/Podcast";
import SocialMedia from "./pages/dashboard/SocialMedia";
import Doctor from "./pages/dashboard/Doctor";
import BeautySalon from "./pages/dashboard/BeautySalon";
import StoreAnalysis from "./pages/dashboard/StoreAnalysis";
import Restaurant from "./pages/dashboard/Restaurant";
import Hotel from "./pages/dashboard/Hotel";
import RealEstateAgent from "./pages/dashboard/RealEstateAgent";
import CreditCard from "./pages/dashboard/CreditCard";
import CryptoTrader from "./pages/dashboard/CryptoTrader";
import CryptoPerformance from "./pages/dashboard/CryptoPerformance";

// Apps
import ToDoList from "./pages/apps/ToDoList";
import Calendar from "./pages/apps/Calendar";
import Contacts from "./pages/apps/Contacts";
import Chat from "./pages/apps/Chat";

import Inbox from "./pages/apps/email/Inbox";
import Promotions from "./pages/apps/email/Promotions";
import Compose from "./pages/apps/email/Compose";
import Read from "./pages/apps/email/Read";

import KanbanBoard from "./pages/apps/KanbanBoard";

import MyDrive from "./pages/apps/file-manager/MyDrive";
import Assets from "./pages/apps/file-manager/Assets";
import Projects from "./pages/apps/file-manager/Projects";
import Personal from "./pages/apps/file-manager/Personal";
import Applications from "./pages/apps/file-manager/Applications";
import Documents from "./pages/apps/file-manager/Documents";
import Media from "./pages/apps/file-manager/Media";
import Recents from "./pages/apps/file-manager/Recents";
import Important from "./pages/apps/file-manager/Important";

// Pages
// Ecommerce Pages
import ProductsGrid from "./pages/ecommerce/ProductsGrid";
import ProductsList from "./pages/ecommerce/ProductsList";
import ProductDetails from "./pages/ecommerce/ProductDetails";
import CreateProduct from "./pages/ecommerce/CreateProduct";
import EditProduct from "./pages/ecommerce/EditProduct";
import Cart from "./pages/ecommerce/Cart";
import Checkout from "./pages/ecommerce/Checkout";
import Orders from "./pages/ecommerce/Orders";
import OrderDetails from "./pages/ecommerce/OrderDetails";
import CreateOrder from "./pages/ecommerce/CreateOrder";
import OrderTracking from "./pages/ecommerce/OrderTracking";
import Customers from "./pages/ecommerce/Customers";
import CustomerDetails from "./pages/ecommerce/CustomerDetails";
import Categories from "./pages/ecommerce/Categories";
import Sellers from "./pages/ecommerce/Sellers";
import SellerDetails from "./pages/ecommerce/SellerDetails";
import CreateSeller from "./pages/ecommerce/CreateSeller";
import Reviews from "./pages/ecommerce/Reviews";
import Refunds from "./pages/ecommerce/Refunds";

// Crm Pages
import CrmContacts from "./pages/crm/CrmContacts";
import CrmCustomers from "./pages/crm/CrmCustomers";
import Leads from "./pages/crm/Leads";
import Deals from "./pages/crm/Deals";

// Project Management Pages
import ProjectOverview from "./pages/project-management/ProjectOverview";
import ProjectsList from "./pages/project-management/ProjectsList";
import CreateProject from "./pages/project-management/CreateProject";
import PMClients from "./pages/project-management/PMClients";
import PMTeams from "./pages/project-management/PMTeams";
import PMKanbanBoard from "./pages/project-management/PMKanbanBoard";
import PMUsers from "./pages/project-management/PMUsers";

// LMS Pages
import CoursesList from "./pages/lms/CoursesList";
import CourseDetails from "./pages/lms/CourseDetails";
import LessonPreview from "./pages/lms/LessonPreview";
import CreateCourse from "./pages/lms/CreateCourse";
import EditCourse from "./pages/lms/EditCourse";
import Instructors from "./pages/lms/Instructors";

// Helpdesk Pages
import Tickets from "./pages/helpdesk/Tickets";
import TicketDetails from "./pages/helpdesk/TicketDetails";
import Agents from "./pages/helpdesk/Agents";
import Reports from "./pages/helpdesk/Reports";

// NFT Pages
import Marketplace from "./pages/nft/Marketplace";
import ExploreAll from "./pages/nft/ExploreAll";
import LiveAuction from "./pages/nft/LiveAuction";
import NftDetails from "./pages/nft/NftDetails";
import Creators from "./pages/nft/Creators";
import CreatorDetails from "./pages/nft/CreatorDetails";
import WalletConnect from "./pages/nft/WalletConnect";
import CreateNft from "./pages/nft/CreateNft";

// Real Estate Pages
import PropertyList from "./pages/real-estate/PropertyList";
import PropertyDetails from "./pages/real-estate/PropertyDetails";
import AddProperty from "./pages/real-estate/AddProperty";
import ReAgents from "./pages/real-estate/ReAgents";
import AgentDetails from "./pages/real-estate/AgentDetails";
import AddAgent from "./pages/real-estate/AddAgent";
import ReCustomers from "./pages/real-estate/ReCustomers";

// Finance Pages
import Wallet from "./pages/finance/Wallet";
import Transactions from "./pages/finance/Transactions";

// Doctor Pages
import PatientsList from "./pages/doctor/PatientsList";
import AddPatient from "./pages/doctor/AddPatient";
import PatientDetails from "./pages/doctor/PatientDetails";
import Appointments from "./pages/doctor/Appointments";
import Prescriptions from "./pages/doctor/Prescriptions";
import WritePrescription from "./pages/doctor/WritePrescription";

// Restaurant Pages
import Menus from "./pages/restaurant/Menus";
import DishDetails from "./pages/restaurant/DishDetails";

// Hotel Pages
import RoomsList from "./pages/hotel/RoomsList";
import RoomDetails from "./pages/hotel/RoomDetails";
import GuestsList from "./pages/hotel/GuestsList";

// Real Estate Agent Pages
import Properties from "./pages/real-estate-agent/Properties";
import ReaPropertyDetails from "./pages/real-estate-agent/ReaPropertyDetails";

// Crypto Trader Pages
import CtTransactions from "./pages/crypto-trader/CtTransactions";
import GainersLosers from "./pages/crypto-trader/GainersLosers";
import CtWallet from "./pages/crypto-trader/CtWallet";

// Events Pages
import EventsGrid from "./pages/events/EventsGrid";
import EventsList from "./pages/events/EventsList";
import EventDetails from "./pages/events/EventDetails";
import CreateAnEvent from "./pages/events/CreateAnEvent";
import EditAnEvent from "./pages/events/EditAnEvent";

// Social Pages
import SocialProfile from "./pages/social/SocialProfile";
import SocialSettings from "./pages/social/SocialSettings";
import SocialAbout from "./pages/social/SocialAbout";
import SocialActivity from "./pages/social/SocialActivity";

// Invoices Pages
import Invoices from "./pages/invoices/Invoices";
import InvoiceDetails from "./pages/invoices/InvoiceDetails";
import CreateInvoice from "./pages/invoices/CreateInvoice";
import EditInvoice from "./pages/invoices/EditInvoice";

// Users pages
import TeamMembers from "./pages/users/TeamMembers";
import UsersList from "./pages/users/UsersList";
import AddUser from "./pages/users/AddUser";

// Profile pages
import UserProfile from "./pages/profile/UserProfile";
import ProfileTeams from "./pages/profile/ProfileTeams";
import ProfileProjects from "./pages/profile/ProfileProjects";

// Starter Page
import Starter from "./pages/Starter";

// icons Page
import MaterialSymbols from "./pages/icons/MaterialSymbols";
import Remixicon from "./pages/icons/Remixicon";

// UI Elements Pages
import Alerts from "./pages/ui-elements/Alerts";
import Avatars from "./pages/ui-elements/Avatars";
import Accordion from "./pages/ui-elements/Accordion";
import Badges from "./pages/ui-elements/Badges";
import Buttons from "./pages/ui-elements/Buttons";
import Spinner from "./pages/ui-elements/Spinner";
import Breadcrumb from "./pages/ui-elements/Breadcrumb";
import Dropdowns from "./pages/ui-elements/Dropdowns";
import Images from "./pages/ui-elements/Images";
import Modal from "./pages/ui-elements/Modal";
import Pagination from "./pages/ui-elements/Pagination";
import Progress from "./pages/ui-elements/Progress";
import Tooltips from "./pages/ui-elements/Tooltips";
import Tabs from "./pages/ui-elements/Tabs";
import Typography from "./pages/ui-elements/Typography";
import Videos from "./pages/ui-elements/Videos";

// Tables Page
import Tables from "./pages/Tables";

// Forms Page
import InputSelect from "./pages/forms/InputSelect";
import CheckboxesRadios from "./pages/forms/CheckboxesRadios";
import RichTextEditor from "./pages/forms/RichTextEditor";
import FileUploader from "./pages/forms/FileUploader";

// Charts Page
import LineCharts from "./pages/charts/LineCharts";
import AreaCharts from "./pages/charts/AreaCharts";
import ColumnCharts from "./pages/charts/ColumnCharts";
import MixedCharts from "./pages/charts/MixedCharts";
import RadialbarCharts from "./pages/charts/RadialbarCharts";
import RadarCharts from "./pages/charts/RadarCharts";
import PieCharts from "./pages/charts/PieCharts";
import PolarCharts from "./pages/charts/PolarCharts";
import MoreCharts from "./pages/charts/MoreCharts";

// Authentication Pages
import SignIn from "./pages/authentication/SignIn";
import SignUp from "./pages/authentication/SignUp";
import ForgotPassword from "./pages/authentication/ForgotPassword";
import ResetPassword from "./pages/authentication/ResetPassword";
import ConfirmEmail from "./pages/authentication/ConfirmEmail";
import LockScreen from "./pages/authentication/LockScreen";
import Logout from "./pages/authentication/Logout";

// Extra Pages
import Pricing from "./pages/Pricing";
import Timeline from "./pages/Timeline";
import Faq from "./pages/Faq";
import Gallery from "./pages/Gallery";
import Testimonials from "./pages/Testimonials";
import Search from "./pages/Search";
import ComingSoon from "./pages/ComingSoon";
import BlankPage from "./pages/BlankPage";
import Widgets from "./pages/Widgets";
import Maps from "./pages/Maps";
import Notifications from "./pages/Notifications";
import Members from "./pages/Members";
import MyProfile from "./pages/MyProfile";
import InternalError from "./pages/InternalError";
import NotFound from "./pages/NotFound";

// Settings Pages
import AccountSettings from "./pages/settings/AccountSettings";
import ChangePassword from "./pages/settings/ChangePassword";
import Connections from "./pages/settings/Connections";
import PrivacyPolicy from "./pages/settings/PrivacyPolicy";
import TermsConditions from "./pages/settings/TermsConditions";

const App: React.FC = () => {
  const [active, setActive] = useState<boolean>(false);
  const [pathname, setPathname] = useState<string>("");

  useEffect(() => {
    setPathname(window.location.pathname); // Get the current path
  }, []);

  const toggleActive = (): void => {
    setActive(!active);
  };

  const isAuthPage = [
    "/authentication/sign-in",
    "/authentication/sign-up",
    "/authentication/forgot-password",
    "/authentication/reset-password",
    "/authentication/confirm-email",
    "/authentication/lock-screen",
    "/authentication/logout",
    "/coming-soon",
    "/",
    "/front-pages/features",
    "/front-pages/team",
    "/front-pages/faq",
    "/front-pages/contact",
  ].includes(pathname);

  return (
    <>
      <div
        className={`main-content-wrap transition-all ${active ? "active" : ""}`}
      >
        <Router>
          {!isAuthPage && (
            <>
              <SidebarMenu toggleActive={toggleActive} />
            </>
          )}

          <div className="main-content transition-all flex flex-col overflow-hidden min-h-screen">
            {!isAuthPage && (
              <>
                <Header toggleActive={toggleActive} />
              </>
            )}

            <Routes>
              {/* Front Pages */}
              <Route path="/" element={<Home />} />
              <Route path="/front-pages/features" element={<Features />} />
              <Route path="/front-pages/team" element={<Team />} />
              <Route path="/front-pages/faq" element={<FpFaq />} />
              <Route path="/front-pages/contact" element={<Contact />} />

              {/* Dashboard */}
              <Route path="/dashboard/ecommerce" element={<Ecommerce />} />
              <Route path="/dashboard/crm" element={<Crm />} />
              <Route
                path="/dashboard/project-management"
                element={<ProjectManagement />}
              />
              <Route path="/dashboard/lms" element={<Lms />} />
              <Route path="/dashboard/helpdesk" element={<HelpDesk />} />
              <Route path="/dashboard/analytics" element={<Analytics />} />
              <Route path="/dashboard/crypto" element={<Crypto />} />
              <Route path="/dashboard/sales" element={<Sales />} />
              <Route path="/dashboard/hospital" element={<Hospital />} />
              <Route path="/dashboard/hrm" element={<Hrm />} />
              <Route path="/dashboard/school" element={<School />} />
              <Route path="/dashboard/call-center" element={<CallCenter />} />
              <Route path="/dashboard/marketing" element={<Marketing />} />
              <Route path="/dashboard/nft" element={<Nft />} />
              <Route path="/dashboard/saas" element={<Saas />} />
              <Route path="/dashboard/real-estate" element={<RealEstate />} />
              <Route path="/dashboard/shipment" element={<Shipment />} />
              <Route path="/dashboard/finance" element={<Finance />} />
              <Route path="/dashboard/pos-system" element={<PosSystem />} />
              <Route path="/dashboard/podcast" element={<Podcast />} />
              <Route path="/dashboard/social-media" element={<SocialMedia />} />
              <Route path="/dashboard/doctor" element={<Doctor />} />
              <Route path="/dashboard/beauty-salon" element={<BeautySalon />} />
              <Route
                path="/dashboard/store-analysis"
                element={<StoreAnalysis />}
              />
              <Route path="/dashboard/restaurant" element={<Restaurant />} />
              <Route path="/dashboard/hotel" element={<Hotel />} />
              <Route
                path="/dashboard/real-estate-agent"
                element={<RealEstateAgent />}
              />
              <Route path="/dashboard/credit-card" element={<CreditCard />} />
              <Route
                path="/dashboard/crypto-trader"
                element={<CryptoTrader />}
              />
              <Route
                path="/dashboard/crypto-performance"
                element={<CryptoPerformance />}
              />

              {/* Apps */}
              <Route path="/apps/to-do-list" element={<ToDoList />} />
              <Route path="/apps/calendar" element={<Calendar />} />
              <Route path="/apps/contacts" element={<Contacts />} />
              <Route path="/apps/chat" element={<Chat />} />

              <Route path="/apps/email/inbox" element={<Inbox />} />
              <Route path="/apps/email/promotions" element={<Promotions />} />
              <Route path="/apps/email/compose" element={<Compose />} />
              <Route path="/apps/email/read" element={<Read />} />

              <Route path="/apps/kanban-board" element={<KanbanBoard />} />

              <Route path="/apps/file-manager/my-drive" element={<MyDrive />} />
              <Route path="/apps/file-manager/assets" element={<Assets />} />
              <Route
                path="/apps/file-manager/projects"
                element={<Projects />}
              />
              <Route
                path="/apps/file-manager/personal"
                element={<Personal />}
              />
              <Route
                path="/apps/file-manager/applications"
                element={<Applications />}
              />
              <Route
                path="/apps/file-manager/documents"
                element={<Documents />}
              />
              <Route path="/apps/file-manager/media" element={<Media />} />
              <Route path="/apps/file-manager/recents" element={<Recents />} />
              <Route
                path="/apps/file-manager/important"
                element={<Important />}
              />

              {/* Pages */}
              {/* Ecommerce Pages */}
              <Route
                path="/ecommerce/products-grid"
                element={<ProductsGrid />}
              />
              <Route
                path="/ecommerce/products-list"
                element={<ProductsList />}
              />
              <Route
                path="/ecommerce/product-details"
                element={<ProductDetails />}
              />
              <Route
                path="/ecommerce/create-product"
                element={<CreateProduct />}
              />
              <Route path="/ecommerce/edit-product" element={<EditProduct />} />
              <Route path="/ecommerce/cart" element={<Cart />} />
              <Route path="/ecommerce/checkout" element={<Checkout />} />
              <Route path="/ecommerce/orders" element={<Orders />} />
              <Route
                path="/ecommerce/order-details"
                element={<OrderDetails />}
              />
              <Route path="/ecommerce/create-order" element={<CreateOrder />} />
              <Route
                path="/ecommerce/order-tracking"
                element={<OrderTracking />}
              />
              <Route path="/ecommerce/customers" element={<Customers />} />
              <Route
                path="/ecommerce/customer-details"
                element={<CustomerDetails />}
              />
              <Route path="/ecommerce/categories" element={<Categories />} />
              <Route path="/ecommerce/sellers" element={<Sellers />} />
              <Route
                path="/ecommerce/seller-details"
                element={<SellerDetails />}
              />
              <Route
                path="/ecommerce/create-seller"
                element={<CreateSeller />}
              />
              <Route path="/ecommerce/reviews" element={<Reviews />} />
              <Route path="/ecommerce/refunds" element={<Refunds />} />

              {/* Crm Pages */}
              <Route path="/crm/contacts" element={<CrmContacts />} />
              <Route path="/crm/customers" element={<CrmCustomers />} />
              <Route path="/crm/leads" element={<Leads />} />
              <Route path="/crm/deals" element={<Deals />} />
              <Route path="/crm/deals" element={<Deals />} />

              {/* Project Management Pages */}
              <Route
                path="/project-management/project-overview"
                element={<ProjectOverview />}
              />
              <Route
                path="/project-management/projects-list"
                element={<ProjectsList />}
              />
              <Route
                path="/project-management/create-project"
                element={<CreateProject />}
              />
              <Route
                path="/project-management/clients"
                element={<PMClients />}
              />
              <Route path="/project-management/teams" element={<PMTeams />} />
              <Route
                path="/project-management/kanban-board"
                element={<PMKanbanBoard />}
              />
              <Route path="/project-management/users" element={<PMUsers />} />

              {/* LMS Pages */}
              <Route path="/lms/courses-list" element={<CoursesList />} />
              <Route path="/lms/course-details" element={<CourseDetails />} />
              <Route path="/lms/lesson-preview" element={<LessonPreview />} />
              <Route path="/lms/create-course" element={<CreateCourse />} />
              <Route path="/lms/edit-course" element={<EditCourse />} />
              <Route path="/lms/instructors" element={<Instructors />} />

              {/* Helpdesk Pages */}
              <Route path="/helpdesk/tickets" element={<Tickets />} />
              <Route
                path="/helpdesk/ticket-details"
                element={<TicketDetails />}
              />
              <Route path="/helpdesk/agents" element={<Agents />} />
              <Route path="/helpdesk/reports" element={<Reports />} />

              {/* NFT Pages */}
              <Route path="/nft/marketplace" element={<Marketplace />} />
              <Route path="/nft/explore-all" element={<ExploreAll />} />
              <Route path="/nft/live-auction" element={<LiveAuction />} />
              <Route path="/nft/nft-details" element={<NftDetails />} />
              <Route path="/nft/creators" element={<Creators />} />
              <Route path="/nft/creator-details" element={<CreatorDetails />} />
              <Route path="/nft/wallet-connect" element={<WalletConnect />} />
              <Route path="/nft/create-nft" element={<CreateNft />} />

              {/* Real Estate Pages */}
              <Route
                path="/real-estate/property-list"
                element={<PropertyList />}
              />
              <Route
                path="/real-estate/property-details"
                element={<PropertyDetails />}
              />
              <Route
                path="/real-estate/add-property"
                element={<AddProperty />}
              />
              <Route path="/real-estate/agents" element={<ReAgents />} />
              <Route
                path="/real-estate/agent-details"
                element={<AgentDetails />}
              />
              <Route path="/real-estate/add-agent" element={<AddAgent />} />
              <Route path="/real-estate/customers" element={<ReCustomers />} />

              {/* Finance Pages */}
              <Route path="/finance/wallet" element={<Wallet />} />
              <Route path="/finance/transactions" element={<Transactions />} />

              {/* Doctor Pages */}
              <Route path="/doctor/patients-list" element={<PatientsList />} />
              <Route path="/doctor/add-patient" element={<AddPatient />} />
              <Route
                path="/doctor/patient-details"
                element={<PatientDetails />}
              />
              <Route path="/doctor/appointments" element={<Appointments />} />
              <Route path="/doctor/prescriptions" element={<Prescriptions />} />
              <Route
                path="/doctor/write-prescription"
                element={<WritePrescription />}
              />

              {/* Restaurant Pages */}
              <Route path="/restaurant/menus" element={<Menus />} />
              <Route
                path="/restaurant/dish-details"
                element={<DishDetails />}
              />

              {/* Hotel Pages */}
              <Route path="/hotel/rooms-list" element={<RoomsList />} />
              <Route path="/hotel/room-details" element={<RoomDetails />} />
              <Route path="/hotel/guests-list" element={<GuestsList />} />

              {/* Real Estate Agent Pages */}
              <Route
                path="/real-estate-agent/properties"
                element={<Properties />}
              />
              <Route
                path="/real-estate-agent/property-details"
                element={<ReaPropertyDetails />}
              />

              {/* Crypto Trader Pages */}
              <Route
                path="/crypto-trader/transactions"
                element={<CtTransactions />}
              />
              <Route
                path="/crypto-trader/gainers-losers"
                element={<GainersLosers />}
              />
              <Route path="/crypto-trader/wallet" element={<CtWallet />} />

              {/* Events Pages */}
              <Route path="/events/events-grid" element={<EventsGrid />} />
              <Route path="/events/events-list" element={<EventsList />} />
              <Route path="/events/event-details" element={<EventDetails />} />
              <Route
                path="/events/create-an-event"
                element={<CreateAnEvent />}
              />
              <Route path="/events/edit-an-event" element={<EditAnEvent />} />

              {/* Social Pages */}
              <Route path="/social/profile" element={<SocialProfile />} />
              <Route path="/social/settings" element={<SocialSettings />} />
              <Route path="/social/about" element={<SocialAbout />} />
              <Route path="/social/activity" element={<SocialActivity />} />

              {/* Invoices Pages */}
              <Route path="/invoices" element={<Invoices />} />
              <Route
                path="/invoices/invoice-details"
                element={<InvoiceDetails />}
              />
              <Route
                path="/invoices/create-invoice"
                element={<CreateInvoice />}
              />
              <Route path="/invoices/edit-invoice" element={<EditInvoice />} />

              {/* Users Pages */}
              <Route path="/users/team-members" element={<TeamMembers />} />
              <Route path="/users/users-list" element={<UsersList />} />
              <Route path="/users/add-user" element={<AddUser />} />

              {/* Profile Pages */}
              <Route path="/profile/user-profile" element={<UserProfile />} />
              <Route path="/profile/teams" element={<ProfileTeams />} />
              <Route path="/profile/projects" element={<ProfileProjects />} />

              {/* Starter Page */}
              <Route path="/starter" element={<Starter />} />

              {/* Icons Pages */}
              <Route
                path="/icons/material-symbols"
                element={<MaterialSymbols />}
              />
              <Route path="/icons/remixicon" element={<Remixicon />} />

              {/* UI Elements Pages */}
              <Route path="/ui-elements/Alerts" element={<Alerts />} />
              <Route path="/ui-elements/avatars" element={<Avatars />} />
              <Route path="/ui-elements/accordion" element={<Accordion />} />
              <Route path="/ui-elements/badges" element={<Badges />} />
              <Route path="/ui-elements/buttons" element={<Buttons />} />
              <Route path="/ui-elements/spinner" element={<Spinner />} />
              <Route path="/ui-elements/breadcrumb" element={<Breadcrumb />} />
              <Route path="/ui-elements/dropdowns" element={<Dropdowns />} />
              <Route path="/ui-elements/images" element={<Images />} />
              <Route path="/ui-elements/modal" element={<Modal />} />
              <Route path="/ui-elements/pagination" element={<Pagination />} />
              <Route path="/ui-elements/progress" element={<Progress />} />
              <Route path="/ui-elements/tooltips" element={<Tooltips />} />
              <Route path="/ui-elements/tabs" element={<Tabs />} />
              <Route path="/ui-elements/typography" element={<Typography />} />
              <Route path="/ui-elements/videos" element={<Videos />} />

              {/* Tables Page */}
              <Route path="/tables" element={<Tables />} />

              {/* Forms Pages */}
              <Route path="/forms/input-select" element={<InputSelect />} />
              <Route
                path="/forms/checkboxes-radios"
                element={<CheckboxesRadios />}
              />
              <Route
                path="/forms/rich-text-editor"
                element={<RichTextEditor />}
              />
              <Route path="/forms/file-uploader" element={<FileUploader />} />

              {/* Charts Pages */}
              <Route path="/charts/line-charts" element={<LineCharts />} />
              <Route path="/charts/area-charts" element={<AreaCharts />} />
              <Route path="/charts/column-charts" element={<ColumnCharts />} />
              <Route path="/charts/mixed-charts" element={<MixedCharts />} />
              <Route
                path="/charts/radialbar-charts"
                element={<RadialbarCharts />}
              />
              <Route path="/charts/radar-charts" element={<RadarCharts />} />
              <Route path="/charts/pie-charts" element={<PieCharts />} />
              <Route path="/charts/polar-charts" element={<PolarCharts />} />
              <Route path="/charts/more-charts" element={<MoreCharts />} />

              {/* Authentication Pages */}
              <Route path="/authentication/sign-in" element={<SignIn />} />
              <Route path="/authentication/sign-up" element={<SignUp />} />
              <Route
                path="/authentication/forgot-password"
                element={<ForgotPassword />}
              />
              <Route
                path="/authentication/reset-password"
                element={<ResetPassword />}
              />
              <Route
                path="/authentication/confirm-email"
                element={<ConfirmEmail />}
              />
              <Route
                path="/authentication/lock-screen"
                element={<LockScreen />}
              />
              <Route path="/authentication/logout" element={<Logout />} />

              {/* Extra Pages */}
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/testimonials" element={<Testimonials />} />
              <Route path="/search" element={<Search />} />
              <Route path="/coming-soon" element={<ComingSoon />} />
              <Route path="/blank-page" element={<BlankPage />} />
              <Route path="/widgets" element={<Widgets />} />
              <Route path="/maps" element={<Maps />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/members" element={<Members />} />
              <Route path="/my-profile" element={<MyProfile />} />

              <Route path="*" element={<NotFound />} />
              <Route path="/internal-error" element={<InternalError />} />

              {/* Settings Pages */}
              <Route path="/settings" element={<AccountSettings />} />
              <Route
                path="/settings/change-password"
                element={<ChangePassword />}
              />
              <Route path="/settings/connections" element={<Connections />} />
              <Route
                path="/settings/privacy-policy"
                element={<PrivacyPolicy />}
              />
              <Route
                path="/settings/terms-conditions"
                element={<TermsConditions />}
              />
            </Routes>

            {!isAuthPage && <Footer />}
          </div>
        </Router>
      </div>
    </>
  );
};

export default App;
